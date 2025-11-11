const Auth = (() => {
  const roleRoutes = {
    1: "../admin/index.html",
    2: "../usuario/index.html",
  };

  const buildSession = (payload) => ({
    id: payload.id,
    nombre: payload.nombre,
    apellido: payload.apellido,
    email: payload.email,
    role_id: payload.role_id,
  });

  const login = async ({ email, password }) => {
    const response = await API.login({
      email,
      password,
      name: "web",
    });

    if (!response?.token || !response?.usuario) {
      throw new Error(response?.mensaje || "No se pudo iniciar sesión");
    }

    Storage.setToken(response.token);
    const session = buildSession(response.usuario);
    Storage.setSession(session);
    Storage.setPermissions(response.permisos || []);
    return session;
  };

  const redirectByRole = (roleId) => {
    const target = roleRoutes[roleId];
    if (target) {
      window.location.href = target;
    } else {
      window.location.href = "../login/index.html";
    }
  };

  const protect = (allowedRoles = []) => {
    const session = Storage.getSession();
    const token = Storage.getToken();
    if (!session || !token) {
      window.location.href = "../login/index.html";
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(session.role_id)) {
      redirectByRole(session.role_id);
      return null;
    }
    return session;
  };

  const logout = () => {
    Storage.clearSession();
    window.location.href = "../login/index.html";
  };

  const bindLogout = (buttonId = "logoutBtn") => {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        logout();
      });
    }
  };

  const setYear = () => {
    const yearHolder = document.getElementById("year");
    if (yearHolder) {
      yearHolder.textContent = new Date().getFullYear();
    }
  };

  const attachLogin = () => {
    const form = document.getElementById("loginForm");
    if (!form) return;
    const message = document.getElementById("loginMessage");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();

      if (message) {
        message.classList.add("hidden");
      }

      try {
        const session = await login({ email, password });
        redirectByRole(session.role_id);
      } catch (error) {
        console.error("Error en login", error);
        if (message) {
          message.textContent = error.message || "Credenciales inválidas. Intenta nuevamente.";
          message.classList.remove("hidden");
        }
      }
    });
  };

  const boot = () => {
    setYear();
    const form = document.getElementById("loginForm");
    if (form) {
      const session = Storage.getSession();
      const token = Storage.getToken();
      if (session && token) {
        redirectByRole(session.role_id);
      } else {
        attachLogin();
      }
    }
  };

  document.addEventListener("DOMContentLoaded", boot);

  return {
    login,
    logout,
    protect,
    redirectByRole,
    bindLogout,
  };
})();

