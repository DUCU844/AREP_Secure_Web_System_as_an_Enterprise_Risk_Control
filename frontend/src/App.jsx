import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export default function App() {
  const {
    error,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
    getAccessTokenSilently,
  } = useAuth0();
  const [result, setResult] = useState('');

  async function callApi() {
    setResult('Consultando API protegida...');
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/risk-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`La API respondió ${response.status}${body ? `: ${body}` : ''}`);
      }
      setResult(JSON.stringify(JSON.parse(body), null, 2));
    } catch (requestError) {
      setResult(`La solicitud falló: ${requestError.message}`);
    }
  }

  if (isLoading) {
    return <main className="card"><p>Comprobando sesión...</p></main>;
  }

  if (error) {
    return <main className="card error"><p>Error de autenticación: {error.message}</p></main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="card">
        <p className="eyebrow">CONTROL DE RIESGO EMPRESARIAL</p>
        <h1>API protegida con identidad y autorización</h1>
        <p>Inicia sesión para solicitar un token y consultar el estado de riesgo.</p>
        <button onClick={() => loginWithRedirect()}>Iniciar sesión</button>
      </main>
    );
  }

  return (
    <main className="card">
      <p className="eyebrow">SESIÓN AUTENTICADA</p>
      <h1>Enterprise Risk Control</h1>
      <p>Usuario: <strong>{user.name || user.email}</strong></p>
      <div className="actions">
        <button onClick={callApi}>Llamar API protegida</button>
        <button className="secondary" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>
          Cerrar sesión
        </button>
      </div>
      <pre aria-live="polite">{result}</pre>
    </main>
  );
}
