// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import WorkerDashboard from './WorkerDashboard';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import TrackDetailsPage from './TrackDetailsPage'; // ✅ ADDED
import TaskHistoryPage from './TaskHistoryPage';
import LeaveRequestPage from './LeaveRequestPage'; // at the top with other imports
import AdminLeavePanel from './AdminLeavePanel';
import SeedHours from './SeedHours';
import GeofenceGate from './components/GeofenceGate';
import StockRoom from './pages/StockRoom';
import SupplyRequest from './pages/SupplyRequest';
import SeedAllHours from "./pages/SeedAllHours";
import AdminTaskCreator from './pages/AdminTaskCreator';
import Clock from './pages/Clock';




function ProtectedRoute({ children, roleRequired }) {
  const { user, role, loading } = useAuth();

  if (loading) return null; // or a loading spinner
  if (!user) return <Navigate to="/" />;
  if (roleRequired && role !== roleRequired) return <Navigate to="/" />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route
  path="/worker-dashboard"
  element={
    <ProtectedRoute allowedRoles={['worker']}>
      <GeofenceGate>
        <WorkerDashboard />
      </GeofenceGate>
    </ProtectedRoute>
  }
/>
          <Route path="/" element={<LoginPage />} />
          <Route path="/task-creator" element={<AdminTaskCreator />} />
          <Route path="/admin/seed-hours" element={<SeedAllHours />} />
          <Route path="/stockroom" element={<StockRoom />} />
          <Route path="/request-supplies" element={<SupplyRequest />} />
          <Route path="/seed-hours" element={<SeedHours />} />
          <Route path="/task-history" element={<TaskHistoryPage />} />
          <Route path="/request-leave" element={<LeaveRequestPage />} />
          <Route path="/admin-leave" element={<AdminLeavePanel />} />
          <Route path="/admin-dashboard"element={<ProtectedRoute roleRequired="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
  path="/clock"
  element={
    <ProtectedRoute roleRequired="worker">
      <Clock />
    </ProtectedRoute>
  }
/>

          <Route
            path="/worker-dashboard"
            element={
              <ProtectedRoute roleRequired="worker">
                <WorkerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/track-details/:trackName"
            element={
              <ProtectedRoute roleRequired="admin">
                <TrackDetailsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
