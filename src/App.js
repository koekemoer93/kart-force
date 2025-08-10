// src/App.js
import React from 'react';
import SafetyChecklistPage from './pages/SafetyChecklistPage';
import SafetyReviewPage from './pages/SafetyReviewPage';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import WorkerDashboard from './WorkerDashboard';
import HRFinancePage from './pages/HRFinancePage';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import TrackDetailsPage from './TrackDetailsPage';
import TaskHistoryPage from './TaskHistoryPage';
import LeaveRequestPage from './LeaveRequestPage';
import AdminLeavePanel from './AdminLeavePanel';
import SeedHours from './SeedHours';
import GeofenceGate from './components/GeofenceGate';
import StockRoom from './pages/StockRoom';
import SupplyRequest from './pages/SupplyRequest';
import SeedAllHours from './pages/SeedAllHours';
import AdminTaskCreator from './pages/AdminTaskCreator';
import Clock from './pages/Clock';
import TaskSeeder from './pages/TaskSeeder';
import { isAdmin as isAdminFn, isWorkerLike as isWorkerLikeFn } from './utils/roles';
import AdminTaskSeeder from './pages/AdminTaskSeeder';
import AdminTaskManager from './pages/AdminTaskManager';



// ✅ Single, consistent guard using `require="admin" | "workerLike"`
function ProtectedRoute({ children, require }) {
  const { user, role, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" />;

  const effectiveRole = (role || profile?.role || '').toLowerCase();

  if (require === 'admin' && !isAdminFn(effectiveRole)) return <Navigate to="/" />;
  if (require === 'workerLike' && !isWorkerLikeFn(effectiveRole)) return <Navigate to="/" />;

  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/seed-tasks" element={<TaskSeeder />} />
          <Route path="/task-creator" element={<AdminTaskCreator />} />
          <Route path="/admin/seed-hours" element={<SeedAllHours />} />
          <Route path="/seed-hours" element={<SeedHours />} />
          <Route path="/task-history" element={<TaskHistoryPage />} />
          <Route path="/request-leave" element={<LeaveRequestPage />} />
          <Route path="/stockroom" element={<StockRoom />} />
          <Route path="/request-supplies" element={<SupplyRequest />} />

          {/* Admin-only */}
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute require="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
  path="/admin-task-manager"
  element={
    <ProtectedRoute require="admin">
      <AdminTaskManager />
    </ProtectedRoute>
  }
/>
          <Route
            path="/track-details/:trackName"
            element={
              <ProtectedRoute require="admin">
                <TrackDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-leave"
            element={
              <ProtectedRoute require="admin">
                <AdminLeavePanel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hr-finance"
            element={
              <ProtectedRoute require="admin">
                <HRFinancePage />
              </ProtectedRoute>
            }
          />

          <Route
  path="/admin-task-seeder"
  element={
    <ProtectedRoute require="admin">
      <AdminTaskSeeder />
    </ProtectedRoute>
  }
/>


          {/* Worker-like */}
          <Route
            path="/worker-dashboard"
            element={
              <ProtectedRoute require="workerLike">
                <GeofenceGate>
                  <WorkerDashboard />
                </GeofenceGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clock"
            element={
              <ProtectedRoute require="workerLike">
                <Clock />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
