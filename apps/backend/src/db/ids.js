import { Counter } from '../models/counter.js';

// People see and share small whole numbers (issue 12, not an ObjectId), so every model keeps a numeric `id`
// next to Mongo's own `_id`. The numbers come from one counter per collection, which MongoDB increments atomically.
export async function nextId(name) {
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  try {
    return (await Counter.findOneAndUpdate({ name }, { $inc: { seq: 1 } }, options).lean()).seq;
  } catch (err) {
    // Two requests creating the same counter at the same moment: one loses the race, and simply tries again.
    if (err.code !== 11000) throw err;
    return (await Counter.findOneAndUpdate({ name }, { $inc: { seq: 1 } }, options).lean()).seq;
  }
}

// Creates a document with the next numeric id and returns it as a plain object.
// If that number is somehow already taken (a counter that fell behind after a restore, or a database that does not
// hand out counter values atomically), the next number is tried instead of failing the request.
// A duplicate-key error caused by some other unique index (one report per person, one account per email) is
// passed on untouched; telling the two apart is a matter of asking whether a document with that id exists.
export async function createWithId(Model, data) {
  for (let attempt = 1; ; attempt++) {
    const id = await nextId(Model.collection.name);
    try {
      await Model.create({ ...data, id });
      return { ...data, id };
    } catch (err) {
      if (err.code !== 11000 || attempt >= 10 || !(await Model.exists({ id }))) throw err;
    }
  }
}

// What every read leaves out: Mongo's internal key.
export const NO_MONGO_ID = '-_id';
