document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.protect([1]);
  if (!session) return;

  Auth.bindLogout();

  const clientForm = document.getElementById("clientForm");
  const clientPassword = document.getElementById("clientPassword");
  const clientMessage = document.getElementById("clientMessage");
  const clientTableBody = document.getElementById("clientTableBody");
  const clientSearch = document.getElementById("clientSearch");

  let clients = [];

  const toArray = (payload, fallbackKey) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (fallbackKey && Array.isArray(payload[fallbackKey])) return payload[fallbackKey];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.result)) return payload.result;
    return [];
  };

  const showMessage = (text, type = "success") => {
    if (!clientMessage) return;
    clientMessage.textContent = text;
    clientMessage.classList.remove("hidden", "error", "success");
    clientMessage.classList.add(type === "error" ? "error" : "success");
    setTimeout(() => clientMessage.classList.add("hidden"), 2500);
  };

  const renderClients = (filter = "") => {
    if (!clientTableBody) return;
    const normalized = filter.trim().toLowerCase();
    const filtered = normalized
      ? clients.filter(
          (client) =>
            (client.nombre || "").toLowerCase().includes(normalized) ||
            (client.correo_electronico || "").toLowerCase().includes(normalized)
        )
      : clients;

    if (!filtered.length) {
      clientTableBody.innerHTML = `<tr><td colspan="5">No se encontraron clientes.</td></tr>`;
      return;
    }

    clientTableBody.innerHTML = filtered
      .map(
        (client) => `
        <tr>
          <td>${client.nombre}</td>
          <td>${client.correo_electronico}</td>
          <td>${client.numero_celular || "—"}</td>
          <td><span class="tag tag-compact">Estado ${client.estado_id ?? "—"}</span></td>
          <td><span class="chip">ID usuario: ${client.user_id ?? "—"}</span></td>
        </tr>
      `
      )
      .join("");
  };

  const loadClients = async () => {
    try {
      const response = await API.getClientes();
      clients = toArray(response, "clientes");
      renderClients(clientSearch ? clientSearch.value : "");
    } catch (error) {
      console.error("Error al obtener clientes", error);
      showMessage(error.message || "No fue posible cargar los clientes.", "error");
    }
  };

  if (clientForm) {
    clientForm.addEventListener("submit", (event) => {
      event.preventDefault();
      showMessage("La creación y edición de clientes debe realizarse desde la API o el sistema principal.", "error");
    });
  }

  if (clientPassword) {
    clientPassword.value = "";
    clientPassword.placeholder = "Gestiona credenciales desde el backend";
    clientPassword.setAttribute("disabled", "true");
  }

  if (clientSearch) {
    clientSearch.addEventListener("input", (event) => renderClients(event.target.value));
  }

  loadClients();
});

