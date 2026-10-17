// A throw-away database name on the MongoDB server given by MONGODB_URI, so test files never share data.
export function testDbUri(tag = 'test') {
  const url = new URL(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
  url.pathname = `/uniseva_${tag}_${process.pid}_${Date.now()}`;
  return url.toString();
}
