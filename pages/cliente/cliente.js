document.addEventListener("DOMContentLoaded", () => {
  const session = Storage.getSession();
  if (!session) {
    window.location.href = "/index.html";
    return;
  }

  // Como la API solo contempla roles de administrador (1) y usuario (2),
  // redirigimos inmediatamente según el rol asignado.
  Auth.redirectByRole(session.role_id);
});
