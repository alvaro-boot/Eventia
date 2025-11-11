document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.protect([1, 2]);
  if (!session) return;

  Auth.bindLogout();

  const eventForm = document.getElementById("eventForm");
  const eventMessage = document.getElementById("eventMessage");
  const eventsTableBody = document.getElementById("eventsTableBody");
  const eventSearch = document.getElementById("eventSearch");
  const clearFormBtn = document.getElementById("clearFormBtn");

  const isAdmin = session.role_id === 1;
  const isUser = session.role_id === 2;
  const canCreate = isAdmin || isUser;
  const canEdit = isAdmin;
  const CLIENT_ID = 1;

  const urlParams = new URLSearchParams(window.location.search);
  const urlViewMode = urlParams.get("mode") === "view";
  let pendingEditId = sessionStorage.getItem("eventia:editEventId");
  let pendingViewId = sessionStorage.getItem("eventia:viewEventId");

  let editingEventId = null;
  let cachedEvents = [];
  let isViewMode = urlViewMode;

  const setViewMode = (enabled) => {
    if (!canCreate) return;
    isViewMode = enabled;
    const fields = eventForm.querySelectorAll(
      "input, textarea, select, button[type='submit']"
    );
    fields.forEach((field) => {
      if (enabled) {
        if (field.type === "submit") {
          field.classList.add("hidden");
        } else {
          field.setAttribute("disabled", "true");
        }
      } else {
        if (field.type === "submit") {
          field.classList.remove("hidden");
        } else {
          field.removeAttribute("disabled");
        }
      }
    });
    if (enabled && clearFormBtn) {
      clearFormBtn.classList.add("hidden");
    } else if (clearFormBtn) {
      clearFormBtn.classList.remove("hidden");
    }
  };

  const showMessage = (text, type = "success") => {
    if (!eventMessage) return;
    eventMessage.textContent = text;
    eventMessage.classList.remove("hidden", "error", "success");
    eventMessage.classList.add(type === "error" ? "error" : "success");
    if (type !== "error") {
      setTimeout(() => eventMessage.classList.add("hidden"), 2500);
    }
  };

  const toArray = (payload, fallbackKey) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (fallbackKey && Array.isArray(payload[fallbackKey]))
      return payload[fallbackKey];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.result)) return payload.result;
    return [];
  };

  const mapEvent = (event) => ({
    id: event.id,
    cliente_id: CLIENT_ID,
    tipo: event.tipo,
    empresa_patrocinadora: event.empresa_patrocinadora,
    logo_empresa: event.logo_empresa,
    nombre: event.nombre,
    descripcion: event.descripcion,
    encargados: event.encargados,
    numero_invitados: event.numero_invitados,
    fecha: event.fecha,
    hora_inicio: event.hora_inicio,
    hora_fin: event.hora_fin,
    lugar: event.lugar,
    estado: event.estado,
    estado_id: event.estado_id,
    user_id: event.user_id,
  });

  const fetchEvents = async () => {
    try {
      const response = await API.listarEventos(CLIENT_ID);
      cachedEvents = toArray(response, "eventos").map(mapEvent);
      renderEvents(eventSearch ? eventSearch.value : "");
      applyPendingSelections();
    } catch (error) {
      console.error("Error al listar eventos", error);
      showMessage(
        error.message || "No fue posible obtener los eventos.",
        "error"
      );
      if (eventsTableBody) {
        eventsTableBody.innerHTML = `
          <tr>
            <td colspan="8">No fue posible cargar los eventos. Intenta nuevamente.</td>
          </tr>
        `;
      }
    }
  };

  const renderEvents = (filter = "") => {
    if (!eventsTableBody) return;

    const normalized = filter.trim().toLowerCase();
    const filtered = normalized
      ? cachedEvents.filter(
          (event) =>
            event.nombre.toLowerCase().includes(normalized) ||
            (event.empresa_patrocinadora || "")
              .toLowerCase()
              .includes(normalized) ||
            (event.tipo || "").toLowerCase().includes(normalized)
        )
      : cachedEvents;

    if (!filtered.length) {
      eventsTableBody.innerHTML = `
        <tr>
          <td colspan="8">No hay eventos que coincidan con tu búsqueda.</td>
        </tr>
      `;
      return;
    }

    eventsTableBody.innerHTML = filtered
      .map((event) => {
        const actions = canEdit
          ? `<button class="btn btn-outline" data-edit="${event.id}">Editar</button>`
          : `<span class="chip">${event.estado || "Activo"}</span>`;
        return `
          <tr>
            <td>${event.nombre}</td>
            <td>${event.tipo || "—"}</td>
            <td>${event.empresa_patrocinadora || "—"}</td>
            <td>${event.fecha || "—"}</td>
            <td>${event.hora_inicio || "00:00"}</td>
            <td>${event.hora_fin || "00:00"}</td>
            <td>${event.encargados || "—"}</td>
            <td>${actions}</td>
          </tr>
        `;
      })
      .join("");
  };

  const applyPendingSelections = () => {
    if (pendingEditId && canEdit) {
      const target = cachedEvents.find(
        (event) => Number(event.id) === Number(pendingEditId)
      );
      if (target) {
        populateForm(target);
        sessionStorage.removeItem("eventia:editEventId");
      }
      pendingEditId = null;
    } else if (pendingEditId) {
      sessionStorage.removeItem("eventia:editEventId");
      pendingEditId = null;
    }

    if (pendingViewId) {
      const target = cachedEvents.find(
        (event) => Number(event.id) === Number(pendingViewId)
      );
      if (target) {
        populateForm(target);
        setViewMode(true);
        sessionStorage.removeItem("eventia:viewEventId");
      }
      pendingViewId = null;
    } else if (urlViewMode) {
      setViewMode(true);
    } else {
      setViewMode(false);
    }
  };

  const resetForm = () => {
    eventForm.reset();
    editingEventId = null;
    eventForm.querySelector("button[type='submit']").textContent =
      "Guardar evento";
    if (eventMessage) {
      eventMessage.classList.add("hidden");
    }
  };

  const populateForm = (event) => {
    document.getElementById("eventId").value = event.id;
    document.getElementById("eventType").value = event.tipo || "";
    document.getElementById("eventSponsor").value =
      event.empresa_patrocinadora || "";
    document.getElementById("eventName").value = event.nombre || "";
    document.getElementById("eventManagers").value = event.encargados || "";
    document.getElementById("eventDescription").value = event.descripcion || "";
    document.getElementById("eventGuests").value = event.numero_invitados ?? 0;
    document.getElementById("eventDate").value = event.fecha || "";
    document.getElementById("eventStartTime").value = event.hora_inicio || "";
    document.getElementById("eventEndTime").value = event.hora_fin || "";
    document.getElementById("eventLocation").value = event.lugar || "";
    editingEventId = event.id;
    eventForm.querySelector("button[type='submit']").textContent =
      "Actualizar evento";
  };

  const extractFormData = () => ({
    tipo: document.getElementById("eventType").value.trim(),
    empresa_patrocinadora: document.getElementById("eventSponsor").value.trim(),
    nombre: document.getElementById("eventName").value.trim(),
    descripcion: document.getElementById("eventDescription").value.trim(),
    encargados: document.getElementById("eventManagers").value.trim(),
    numero_invitados: document.getElementById("eventGuests").value,
    fecha: document.getElementById("eventDate").value,
    hora_inicio: document.getElementById("eventStartTime").value,
    hora_fin: document.getElementById("eventEndTime").value,
    lugar: document.getElementById("eventLocation").value.trim(),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) {
      showMessage("No tienes permisos para gestionar eventos.", "error");
      return;
    }

    const formData = extractFormData();
    const requiredFields = [
      "tipo",
      "nombre",
      "descripcion",
      "encargados",
      "numero_invitados",
      "fecha",
      "hora_inicio",
      "hora_fin",
      "lugar",
    ];
    const missing = requiredFields.filter((field) => !formData[field]);
    if (missing.length) {
      showMessage(
        "Completa todos los campos obligatorios del formulario.",
        "error"
      );
      return;
    }

    const payload = {
      ...formData,
      numero_invitados: Number(formData.numero_invitados) || 0,
      cliente_id: CLIENT_ID,
      user_id: session.id,
      estado: "Activo",
      estado_id: 1,
      logo_empresa: "",
      compromisos: "",
      observaciones: "",
    };

    try {
      if (editingEventId && canEdit) {
        await API.actualizarEvento(CLIENT_ID, editingEventId, payload);
        showMessage("Evento actualizado correctamente.");
      } else {
        if (editingEventId && !canEdit) {
          showMessage(
            "No tienes permisos para actualizar eventos. Crea un nuevo evento.",
            "error"
          );
          return;
        }
        await API.crearEvento(CLIENT_ID, payload);
        showMessage("Evento creado correctamente.");
      }
      resetForm();
      await fetchEvents();
    } catch (error) {
      console.error("Error al guardar evento", error);
      showMessage(
        error.message || "No fue posible guardar el evento.",
        "error"
      );
    }
  };

  const handleListActions = (event) => {
    const editButton = event.target.closest("button[data-edit]");
    if (!editButton) return;
    const eventId = Number(editButton.dataset.edit);
    const target = cachedEvents.find((evt) => Number(evt.id) === eventId);
    if (target) {
      populateForm(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!canCreate) {
    eventForm.querySelectorAll("input, button, textarea").forEach((el) => {
      if (el.id === "logoutBtn" || el === eventSearch) return;
      if (el.type !== "button") {
        el.setAttribute("disabled", "true");
      }
    });
    showMessage(
      "Solo los usuarios autorizados pueden gestionar eventos.",
      "error"
    );
  }

  eventForm.addEventListener("submit", handleSubmit);
  if (eventsTableBody && canEdit) {
    eventsTableBody.addEventListener("click", handleListActions);
  }
  if (eventSearch && canEdit) {
    eventSearch.addEventListener("input", (evt) =>
      renderEvents(evt.target.value)
    );
  }
  clearFormBtn.addEventListener("click", (evt) => {
    evt.preventDefault();
    resetForm();
    setViewMode(false);
  });

  fetchEvents();
});
