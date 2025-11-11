const Storage = (() => {
  const KEYS = {
    TOKEN: "eventia:token",
    SESSION: "eventia:session",
    PERMISSIONS: "eventia:permissions",
  };

  const setToken = (token) => {
    if (!token) {
      localStorage.removeItem(KEYS.TOKEN);
      return;
    }
    localStorage.setItem(KEYS.TOKEN, token);
  };

  const getToken = () => localStorage.getItem(KEYS.TOKEN) || null;

  const setSession = (session) => {
    if (!session) {
      localStorage.removeItem(KEYS.SESSION);
      return;
    }
    localStorage.setItem(KEYS.SESSION, JSON.stringify(session));
  };

  const getSession = () => {
    try {
      const raw = localStorage.getItem(KEYS.SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("Error al recuperar la sesión", error);
      return null;
    }
  };

  const setPermissions = (permissions = []) => {
    localStorage.setItem(KEYS.PERMISSIONS, JSON.stringify(permissions));
  };

  const getPermissions = () => {
    try {
      const raw = localStorage.getItem(KEYS.PERMISSIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error("Error al recuperar los permisos", error);
      return [];
    }
  };

  const clearSession = () => {
    localStorage.removeItem(KEYS.SESSION);
    localStorage.removeItem(KEYS.TOKEN);
    localStorage.removeItem(KEYS.PERMISSIONS);
  };

  return {
    setToken,
    getToken,
    setSession,
    getSession,
    setPermissions,
    getPermissions,
    clearSession,
  };
})();