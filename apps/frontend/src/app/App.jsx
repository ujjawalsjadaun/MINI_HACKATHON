import { Navigate, Route, Routes } from 'react-router-dom';
import { useI18n } from '../lib/i18n.js';
import Layout from './Layout.jsx';
import RequireRole, { PublicOnly } from './RequireRole.jsx';
import { homeFor, useAuth } from './AuthContext.jsx';
import AdminIssue from './pages/AdminIssue.jsx';
import Emergency from './pages/Emergency.jsx';
import Feed from './pages/Feed.jsx';
import Forgot from './pages/Forgot.jsx';
import Insights from './pages/Insights.jsx';
import IssueDetail from './pages/IssueDetail.jsx';
import Login from './pages/Login.jsx';
import MapPage from './pages/MapPage.jsx';
import Mine from './pages/Mine.jsx';
import Notifications from './pages/Notifications.jsx';
import People from './pages/People.jsx';
import QrTags from './pages/QrTags.jsx';
import Queue from './pages/Queue.jsx';
import Report from './pages/Report.jsx';
import Security from './pages/Security.jsx';

const ALL = ['student', 'staff', 'admin'];
const TEAM = ['admin', 'staff'];

function Home() {
  const { user, booting } = useAuth();
  if (booting) return null;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

function NotFound() {
  const { t } = useI18n();
  return <div className="card"><h1>{t('Page not found')}</h1></div>;
}

// Every screen and who may open it. The page files sit next to this one in ./pages.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot" element={<Forgot />} />
        </Route>
        <Route element={<RequireRole roles={['student']} />}>
          <Route path="/report" element={<Report />} />
          <Route path="/mine" element={<Mine />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/issue/:id" element={<IssueDetail />} />
        </Route>
        <Route element={<RequireRole roles={TEAM} />}>
          <Route path="/admin" element={<Queue />} />
          <Route path="/admin/issue/:id" element={<AdminIssue />} />
        </Route>
        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/admin/qr" element={<QrTags />} />
          <Route path="/admin/people" element={<People />} />
          <Route path="/insights" element={<Insights />} />
        </Route>
        <Route element={<RequireRole roles={ALL} />}>
          <Route path="/map" element={<MapPage />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/security" element={<Security />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
