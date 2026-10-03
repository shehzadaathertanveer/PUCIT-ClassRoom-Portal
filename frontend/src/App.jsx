import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import OtpVerify from "./pages/OtpVerify";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyRecoveryOtp from "./pages/VerifyRecoveryOtp";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ClassroomDetail from "./pages/ClassroomDetail";
import MarksSheet from "./pages/MarksSheet";
import LabroomDetail from "./pages/LabroomDetail";
import LabMarksSheet from "./pages/LabMarksSheet";
import Maintenance from "./pages/Maintenance";

// Protected Route Component to block unauthenticated users and enforce Maintenance Mode (Admin only bypass)
const ProtectedRoute = ({ children }) => {
  const { user, loading, maintenance } = useAuth();

  if (loading) {
    return (
      <div className="lm-canvas relative min-h-dvh flex flex-col items-center justify-center overflow-hidden px-4">
        <div className="lm-ambient" aria-hidden="true"></div>
        <div className="lm-topline" aria-hidden="true"></div>

        <div className="relative z-10 w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-orange-200 shadow-chrome">
            <ShieldCheckIcon className="h-7 w-7" />
          </div>

          <div className="lm-card px-6 py-7 sm:px-8">
            <div className="flex justify-center">
              <div className="lm-bar" role="status" aria-live="polite"></div>
            </div>
            <p className="lm-eyebrow mt-5">Loading Portal...</p>
          </div>
        </div>
      </div>
    );
  }

  // Enforce Maintenance Mode Lock: ONLY ADMIN can bypass. Teachers and students are locked out.
  const isAdmin = user && user.role === 'ADMIN';
  if (maintenance?.isUnderMaintenance && !isAdmin) {
    return <Maintenance maintenanceData={maintenance} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth & Password Recovery Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/otp-verify" element={<OtpVerify />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-recovery-otp" element={<VerifyRecoveryOtp />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/maintenance" element={<Maintenance />} />

        {/* Protected Portal Dashboard & Classroom Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/classroom/:classroomId"
          element={
            <ProtectedRoute>
              <ClassroomDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/classroom/:classroomId/sheet/:category/:itemId"
          element={
            <ProtectedRoute>
              <MarksSheet />
            </ProtectedRoute>
          }
        />

        {/* Protected Labroom & Lab Marksheet Routes (Supporting both singular and plural paths) */}
        <Route
          path="/labroom/:labroomId"
          element={
            <ProtectedRoute>
              <LabroomDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/labrooms/:labroomId"
          element={
            <ProtectedRoute>
              <LabroomDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/labroom/:labroomId/sheet/:category/:itemId"
          element={
            <ProtectedRoute>
              <LabMarksSheet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/labrooms/:labroomId/sheet/:category/:itemId"
          element={
            <ProtectedRoute>
              <LabMarksSheet />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect to home/login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;