document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.protect([1, 2]);
  if (!session) return;

  Auth.bindLogout();

  const eventForm = document.getElementById("eventForm");
  const eventMessage = document.getElementById("eventMessage");
  const eventsTableBody = document.getElementById("eventsTableBody");
  const eventSearch = document.getElementById("eventSearch");
  const clearFormBtn = document.getElementById("clearFormBtn");
  const enableEditBtn = document.getElementById("enableEditBtn");

  const isAdmin = session.role_id === 1;
  const isUser = session.role_id === 2;
  const canManage = isAdmin || isUser;
  const canCreate = canManage;
  const canEdit = canManage;

  // Variables para gestión de cliente_id dinámico
  let clientId = null;
  let cachedClients = [];

  // Menú hamburguesa
  const menuToggle = document.getElementById("menuToggle");
  const mainMenu = document.getElementById("mainMenu");
  if (menuToggle && mainMenu) {
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = mainMenu.hidden;
      mainMenu.hidden = !isHidden;
      menuToggle.setAttribute("aria-expanded", !isHidden);
    });

    document.addEventListener("click", (e) => {
      if (!mainMenu.contains(e.target) && !menuToggle.contains(e.target)) {
        mainMenu.hidden = true;
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });

    mainMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".main-menu__item");
      if (!item) return;

      const action = item.dataset.action;
      switch (action) {
        case "edit-event":
          setViewMode(false);
          const url = new URL(window.location.href);
          if (url.searchParams.get("mode") === "view") {
            url.searchParams.delete("mode");
            window.history.replaceState({}, "", url.toString());
          }
          break;
        case "back-panel":
          if (isAdmin) {
            window.location.href = "../admin/index.html";
          } else if (isUser) {
            window.location.href = "../usuario/index.html";
          }
          break;
        case "logout":
          Auth.logout();
          break;
      }
      mainMenu.hidden = true;
    });
  }

  // Asegurar que el formulario esté habilitado para administradores y usuarios
  if (eventForm && canManage) {
    eventForm
      .querySelectorAll("input, textarea, select, button[type='submit']")
      .forEach((el) => {
        if (
          el.id === "logoutBtn" ||
          el.id === "backToPanelBtn" ||
          el.id === "enableEditBtn"
        )
          return;
        el.removeAttribute("disabled");
      });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const urlViewMode = urlParams.get("mode") === "view";
  let pendingEditId = sessionStorage.getItem("eventia:editEventId");
  let pendingViewId = sessionStorage.getItem("eventia:viewEventId");

  let editingEventId = null;
  let editingEventClientId = null; // Guardar el cliente_id del evento que se está editando
  let cachedEvents = [];
  let currentClientIdForEvents = null; // Guardar el cliente_id usado para cargar los eventos
  let isViewMode = urlViewMode;

  const setViewMode = (enabled) => {
    if (!canManage) return;
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
    const editMenuItem = mainMenu?.querySelector('[data-action="edit-event"]');
    if (editMenuItem) {
      if (enabled) {
        editMenuItem.hidden = false;
      } else {
        editMenuItem.hidden = true;
      }
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

  const resolveClientId = async () => {
    if (clientId) return clientId;
    try {
      const response = await API.getClientes();
      cachedClients = toArray(response, "clientes");
      if (!cachedClients.length) return null;
      if (session.role_id === 2) {
        const matchByUser = cachedClients.find(
          (client) => Number(client.user_id) === Number(session.id)
        );
        clientId = matchByUser ? matchByUser.id : cachedClients[0].id;
      } else {
        clientId = cachedClients[0].id;
      }
      return clientId;
    } catch (error) {
      console.error("Error al cargar clientes", error);
      return null;
    }
  };

  const mapEvent = (event, fallbackClientId = null) => {
    // Preservar el cliente_id original del evento si existe
    // Solo usar fallback si el evento no tiene cliente_id
    const eventClientId = event.cliente_id || fallbackClientId || null;
    return {
      id: event.id,
      cliente_id: eventClientId,
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
    };
  };

  const fetchEvents = async () => {
    try {
      const currentClientId = await resolveClientId();
      if (!currentClientId) {
        showMessage(
          "No se pudo determinar el cliente. Intenta nuevamente.",
          "error"
        );
        return;
      }
      currentClientIdForEvents = currentClientId; // Guardar el cliente_id usado
      const response = await API.listarEventos(currentClientId);
      const eventosRaw = toArray(response, "eventos");
      console.log("Eventos recibidos del API:", eventosRaw.slice(0, 2)); // Log primeros 2 para ver estructura
      // Mapear eventos preservando el cliente_id que viene del API
      // Si el evento no tiene cliente_id, usar el currentClientId como fallback
      cachedEvents = eventosRaw.map((event) => {
        const mapped = mapEvent(event, currentClientId);
        console.log(
          `Evento ${mapped.id}: cliente_id original=${event.cliente_id}, mapeado=${mapped.cliente_id}`
        );
        return mapped;
      });
      renderEvents(eventSearch ? eventSearch.value : "");
      await applyPendingSelections();
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

  const applyPendingSelections = async () => {
    if (pendingEditId && canEdit) {
      // Cargar el evento directamente desde la API para obtener el cliente_id correcto
      try {
        const currentClientId = await resolveClientId();
        if (currentClientId) {
          try {
            const eventData = await API.listarEvento(
              currentClientId,
              pendingEditId
            );
            const mappedEvent = mapEvent(eventData, currentClientId);
            // Asegurar que tenga el cliente_id correcto
            mappedEvent.cliente_id = eventData.cliente_id || currentClientId;
            populateForm(mappedEvent);
            sessionStorage.removeItem("eventia:editEventId");
            pendingEditId = null;
            return;
          } catch (apiError) {
            // Si falla, intentar con otros clientes
            if (!cachedClients.length) {
              await resolveClientId();
            }
            for (const client of cachedClients) {
              try {
                const eventData = await API.listarEvento(
                  client.id,
                  pendingEditId
                );
                const mappedEvent = mapEvent(eventData, client.id);
                // Asegurar que tenga el cliente_id correcto
                mappedEvent.cliente_id = client.id;
                populateForm(mappedEvent);
                sessionStorage.removeItem("eventia:editEventId");
                pendingEditId = null;
                return;
              } catch (err) {
                continue;
              }
            }
          }
        }
        // Fallback: usar el evento del cache
        const target = cachedEvents.find(
          (event) => Number(event.id) === Number(pendingEditId)
        );
        if (target) {
          populateForm(target);
          sessionStorage.removeItem("eventia:editEventId");
        }
        pendingEditId = null;
      } catch (error) {
        console.error("Error al cargar evento pendiente", error);
        const target = cachedEvents.find(
          (event) => Number(event.id) === Number(pendingEditId)
        );
        if (target) {
          populateForm(target);
        }
        sessionStorage.removeItem("eventia:editEventId");
        pendingEditId = null;
      }
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

  const setDefaultValues = () => {
    const eventDate = document.getElementById("eventDate");
    const eventStartTime = document.getElementById("eventStartTime");
    const eventEndTime = document.getElementById("eventEndTime");

    // Establecer fecha actual si el campo está vacío
    if (eventDate && !eventDate.value) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      eventDate.value = `${year}-${month}-${day}`;
    }

    // Establecer hora de inicio a las 8:00 AM si está vacío
    if (eventStartTime && !eventStartTime.value) {
      eventStartTime.value = "08:00";
    }

    // Establecer hora de fin a las 6:00 PM si está vacío
    if (eventEndTime && !eventEndTime.value) {
      eventEndTime.value = "18:00";
    }
  };

  const resetForm = () => {
    eventForm.reset();
    editingEventId = null;
    editingEventClientId = null; // Limpiar también el cliente_id
    eventForm.querySelector("button[type='submit']").textContent =
      "Guardar evento";
    if (eventMessage) {
      eventMessage.classList.add("hidden");
    }
    // Establecer valores por defecto después de resetear
    setDefaultValues();
  };

  const populateForm = (event) => {
    console.log("populateForm - Evento recibido:", {
      id: event.id,
      cliente_id: event.cliente_id,
    });
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
    editingEventClientId = event.cliente_id || null; // Guardar el cliente_id del evento
    console.log("populateForm - Guardado:", {
      editingEventId,
      editingEventClientId,
    });
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
    if (!canManage) {
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

    try {
      // Determinar el cliente_id correcto
      let targetClientId;
      if (editingEventId && canEdit) {
        // Prioridad 1: Usar el cliente_id guardado cuando se cargó el evento
        if (editingEventClientId) {
          targetClientId = editingEventClientId;
        } else {
          // Prioridad 2: Buscar en cachedEvents
          const eventBeingEdited = cachedEvents.find(
            (evt) => Number(evt.id) === Number(editingEventId)
          );
          if (eventBeingEdited && eventBeingEdited.cliente_id) {
            targetClientId = eventBeingEdited.cliente_id;
          } else {
            // Prioridad 3: Usar el cliente_id con el que se cargaron los eventos (más confiable)
            if (currentClientIdForEvents) {
              targetClientId = currentClientIdForEvents;
            } else {
              // Prioridad 4: Usar el cliente_id resuelto dinámicamente (último fallback)
              targetClientId = await resolveClientId();
              if (!targetClientId) {
                showMessage(
                  "No se pudo determinar el cliente del evento. Recarga la página e intenta nuevamente.",
                  "error"
                );
                return;
              }
            }
          }
        }
      } else {
        // Al crear, usar el cliente_id resuelto dinámicamente
        targetClientId = await resolveClientId();
        if (!targetClientId) {
          showMessage(
            "No se pudo determinar el cliente. Intenta nuevamente.",
            "error"
          );
          return;
        }
      }

      const payload = {
        ...formData,
        numero_invitados: Number(formData.numero_invitados) || 0,
        cliente_id: targetClientId,
        user_id: session.id,
        estado: "Activo",
        estado_id: 1,
        logo_empresa: "",
        compromisos: "",
        observaciones: "",
      };

      if (editingEventId && canEdit) {
        console.log("Actualizando evento", {
          clienteId: targetClientId,
          eventoId: editingEventId,
          editingEventClientId: editingEventClientId,
          eventFromCache: cachedEvents.find(
            (e) => Number(e.id) === Number(editingEventId)
          ),
          payload,
        });
        await API.actualizarEvento(targetClientId, editingEventId, payload);
        showMessage("Evento actualizado correctamente.");
      } else {
        if (editingEventId && !canEdit) {
          showMessage(
            "No tienes permisos para actualizar eventos. Crea un nuevo evento.",
            "error"
          );
          return;
        }
        await API.crearEvento(targetClientId, payload);
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

  const handleListActions = async (event) => {
    const editButton = event.target.closest("button[data-edit]");
    if (!editButton) return;
    const eventId = Number(editButton.dataset.edit);

    // Intentar cargar el evento directamente desde la API para obtener el cliente_id correcto
    try {
      const currentClientId = await resolveClientId();
      if (!currentClientId) {
        showMessage(
          "No se pudo determinar el cliente. Intenta nuevamente.",
          "error"
        );
        return;
      }

      // Intentar cargar el evento con el cliente_id resuelto
      try {
        const eventData = await API.listarEvento(currentClientId, eventId);
        const mappedEvent = mapEvent(eventData, currentClientId);
        // Asegurar que tenga el cliente_id correcto
        if (!mappedEvent.cliente_id) {
          mappedEvent.cliente_id = currentClientId;
        }
        populateForm(mappedEvent);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      } catch (apiError) {
        // Si falla con el cliente_id resuelto, intentar con otros clientes
        console.warn(
          `Evento no encontrado con cliente_id ${currentClientId}, intentando con otros clientes...`
        );

        // Cargar todos los clientes disponibles
        if (!cachedClients.length) {
          await resolveClientId(); // Esto carga cachedClients
        }

        // Intentar con cada cliente hasta encontrar el evento
        for (const client of cachedClients) {
          try {
            const eventData = await API.listarEvento(client.id, eventId);
            const mappedEvent = mapEvent(eventData, client.id);
            // Asegurar que tenga el cliente_id correcto
            mappedEvent.cliente_id = client.id;
            populateForm(mappedEvent);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          } catch (err) {
            // Continuar con el siguiente cliente
            continue;
          }
        }

        // Si no se encontró en ningún cliente, usar el evento del cache como fallback
        const target = cachedEvents.find((evt) => Number(evt.id) === eventId);
        if (target) {
          console.warn(
            "Usando evento del cache (puede tener cliente_id incorrecto)"
          );
          populateForm(target);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          showMessage(
            "No se pudo cargar el evento. Intenta nuevamente.",
            "error"
          );
        }
      }
    } catch (error) {
      console.error("Error al cargar evento para editar", error);
      // Fallback: usar el evento del cache
      const target = cachedEvents.find((evt) => Number(evt.id) === eventId);
      if (target) {
        populateForm(target);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        showMessage(
          "No se pudo cargar el evento. Intenta nuevamente.",
          "error"
        );
      }
    }
  };

  if (!canManage && eventForm) {
    eventForm.querySelectorAll("input, button, textarea").forEach((el) => {
      if (
        el.id === "logoutBtn" ||
        el.id === "backToPanelBtn" ||
        el.id === "enableEditBtn" ||
        el === eventSearch
      )
        return;
      if (el.type !== "button" && el.type !== "submit") {
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

  // Establecer valores por defecto al cargar la página
  setDefaultValues();

  fetchEvents();
});
