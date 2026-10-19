import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout, ProtectedRoute } from './components/layout';
import {
  Home,
  Login,
  Register,
  Dashboard,
  SignDocument,
  VerifyDocument,
  Documents,
  Profile,
  KEMExplorer,
  SignLink,
  TermsOfUse,
  PrivacyPolicy,
} from './pages';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Signer link: no account, no app chrome */}
          <Route path="/firmar/:token" element={<SignLink />} />

          {/* Routes with Layout */}
          <Route element={<Layout />}>
            {/* Public home */}
            <Route path="/" element={<Home />} />
            <Route path="/terminos" element={<TermsOfUse />} />
            <Route path="/privacidad" element={<PrivacyPolicy />} />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sign"
              element={
                <ProtectedRoute>
                  <SignDocument />
                </ProtectedRoute>
              }
            />
            <Route
              path="/verify"
              element={
                <ProtectedRoute>
                  <VerifyDocument />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents/:id"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/kem"
              element={
                <ProtectedRoute>
                  <KEMExplorer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
