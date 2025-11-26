document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.protect([2]);
  if (!session) return;

  Auth.bindLogout();

  const badge = document.getElementById("userClientBadge");
  const activeEventsCount = document.getElementById("activeEventsCount");
  const assistancesCount = document.getElementById("assistancesCount");
  const nextEventInfo = document.getElementById("nextEventInfo");
  const userEventsTableBody = document.getElementById("userEventsTableBody");

  const CLIENT_ID = 1;

  let countdownInterval = null;
  let events = [];
  let clientName = "";
  const assistancesByEvent = new Map();
  const adjustMenuPosition = (menu) => {
    if (!menu) return;
    const toggle = menu.closest(".smart-menu")?.querySelector("[data-menu-toggle]");
    if (!toggle) return;

    const toggleRect = toggle.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    
    // Calcular posición
    menu.style.position = "fixed";
    menu.style.top = `${toggleRect.bottom + 8}px`;
    menu.style.right = `${viewportWidth - toggleRect.right}px`;
    menu.style.left = "auto";
    menu.style.bottom = "auto";
    
    // Verificar si el menú se sale por abajo
    menu.hidden = false;
    const menuRect = menu.getBoundingClientRect();
    menu.hidden = true;
    
    if (menuRect.bottom > viewportHeight) {
      // Mostrar arriba si no cabe abajo
      menu.style.top = "auto";
      menu.style.bottom = `${viewportHeight - toggleRect.top + 8}px`;
      menu.classList.add("smart-menu__list--top");
    } else {
      menu.classList.remove("smart-menu__list--top");
    }
    
    // Ajustar si se sale por la derecha
    if (menuRect.right > viewportWidth) {
      menu.style.right = "8px";
      menu.style.left = "auto";
    }
    
    // Ajustar si se sale por la izquierda
    if (menuRect.left < 0) {
      menu.style.left = "8px";
      menu.style.right = "auto";
    }
  };

  const setMenuVisibility = (menu, visible) => {
    if (!menu) return;
    menu.hidden = !visible;
    if (!visible) {
      menu.classList.remove("smart-menu__list--top");
      menu.style.top = "";
      menu.style.right = "";
      menu.style.left = "";
      menu.style.bottom = "";
    } else {
      adjustMenuPosition(menu);
    }
    const toggle = menu.closest(".smart-menu")?.querySelector("[data-menu-toggle]");
    if (toggle) {
      toggle.setAttribute("aria-expanded", visible ? "true" : "false");
    }
  };

  const closeAllMenus = (except = null) => {
    document.querySelectorAll(".smart-menu__list").forEach((menu) => {
      if (menu === except) return;
      setMenuVisibility(menu, false);
    });
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

  const fetchClientName = async () => {
    try {
      const response = await API.getClientes();
      const clients = toArray(response, "clientes");
      const matched =
        clients.find((client) => Number(client.id) === CLIENT_ID) || null;
      clientName = matched?.nombre || "Cliente asignado";
    } catch (error) {
      console.error("Error al obtener clientes", error);
      clientName = "Cliente asignado";
    }
    if (badge) {
      badge.textContent = `${session.nombre} ${
        session.apellido || ""
      } • ${clientName}`;
    }
  };

  const mapEvent = (event) => ({
    id: event.id,
    nombre: event.nombre,
    fecha: event.fecha,
    hora_inicio: event.hora_inicio,
    hora_fin: event.hora_fin,
    lugar: event.lugar,
    empresa_patrocinadora: event.empresa_patrocinadora,
    tipo: event.tipo,
    encargados: event.encargados,
  });

  const normalizeTime = (rawTime) => {
    if (!rawTime) return "00:00";
    const trimmed = rawTime.toString().trim();
    const numericMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (numericMatch) {
      const hours = String(numericMatch[1]).padStart(2, "0");
      const minutes = String(numericMatch[2]).padStart(2, "0");
      return `${hours}:${minutes}`;
    }

    const cleaned = trimmed.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    const ampmMatch = cleaned.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm)$/
    );
    if (ampmMatch) {
      let hours = Number(ampmMatch[1]);
      const minutes = String(ampmMatch[2]).padStart(2, "0");
      const isPm = ampmMatch[4] === "pm";
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      return `${String(hours).padStart(2, "0")}:${minutes}`;
    }

    return "00:00";
  };

  const parseEventDate = (event) => {
    if (!event?.fecha) return new Date(NaN);
    const time = normalizeTime(event.hora_inicio);
    const composed = `${event.fecha.split("T")[0]}T${time}`;
    const parsed = new Date(composed);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
    const fallback = new Date(event.fecha);
    return Number.isNaN(fallback.valueOf()) ? new Date(NaN) : fallback;
  };

  const formatDateLabel = (eventDate, rawDate) => {
    if (eventDate instanceof Date && !Number.isNaN(eventDate.valueOf())) {
      return eventDate.toLocaleDateString("es-CO", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }
    return rawDate || "Sin fecha definida";
  };

  const formatTimeLabel = (rawTime) => {
    if (!rawTime) return "Sin hora";
    const normalized = normalizeTime(rawTime);
    const [hours, minutes] = normalized.split(":");
    if (!hours || minutes === undefined) {
      return rawTime;
    }
    const date = new Date();
    date.setHours(Number(hours));
    date.setMinutes(Number(minutes));
    return date.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const loadEvents = async () => {
    const response = await API.listarEventos(CLIENT_ID);
    events = toArray(response, "eventos").map(mapEvent);
  };

  const loadAssistances = async () => {
    assistancesByEvent.clear();
    await Promise.all(
      events.map(async (event) => {
        try {
          const response = await API.listarAsistencia(event.id);
          const assistances = toArray(response, "asistencias");
          assistancesByEvent.set(
            event.id,
            assistances.map((assist) => ({
              id: assist.id,
              asiste: Number(assist.asiste) === 1,
            }))
          );
        } catch (error) {
          console.error(
            `Error al obtener asistencias del evento ${event.id}`,
            error
          );
          assistancesByEvent.set(event.id, []);
        }
      })
    );
  };

  const renderStats = () => {
    const now = new Date();
    const futureEvents = events.filter((event) => parseEventDate(event) >= now);
    if (activeEventsCount) {
      activeEventsCount.textContent = futureEvents.length;
    }

    const totalAssistances = Array.from(assistancesByEvent.values()).reduce(
      (sum, list) => sum + list.filter((assist) => assist.asiste).length,
      0
    );
    if (assistancesCount) {
      assistancesCount.textContent = totalAssistances;
    }

    if (!nextEventInfo) return;

    if (!events.length) {
      nextEventInfo.innerHTML = `<strong>Sin eventos</strong><p class="timer">Crea un nuevo evento para comenzar</p>`;
      return;
    }

    const sortedEvents = [...events].sort(
      (a, b) => parseEventDate(a) - parseEventDate(b)
    );
    const upcoming =
      sortedEvents.find((event) => parseEventDate(event) >= now) ??
      sortedEvents[sortedEvents.length - 1];
    const nextDate = parseEventDate(upcoming);

    nextEventInfo.innerHTML = `
      <strong>${upcoming.nombre}</strong>
      <p>${formatDateLabel(nextDate, upcoming.fecha)} • ${formatTimeLabel(
      upcoming.hora_inicio
    )} • ${upcoming.empresa_patrocinadora || "Sin patrocinador"}</p>
      <p>${upcoming.lugar || "Sin lugar definido"}</p>
      <p class="timer"></p>
    `;

    const timerElement = nextEventInfo.querySelector(".timer");
    const updateTimer = () => {
      const diff = nextDate - new Date();
      if (!Number.isFinite(diff)) {
        timerElement.textContent = "Fecha u hora no disponible";
        if (countdownInterval) clearInterval(countdownInterval);
        return;
      }
      if (diff <= 0) {
        timerElement.textContent = "En curso o finalizado";
        if (countdownInterval) clearInterval(countdownInterval);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      timerElement.textContent = `Faltan ${days}d ${hours}h ${minutes}m`;
    };

    updateTimer();
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(updateTimer, 60000);
  };

  const renderEvents = () => {
    if (!userEventsTableBody) return;

    if (!events.length) {
      userEventsTableBody.innerHTML = `
        <tr>
          <td colspan="7">No hay eventos registrados.</td>
        </tr>
      `;
      return;
    }

    userEventsTableBody.innerHTML = events
      .map(
        (event) => `
          <tr>
            <td>${event.nombre}</td>
            <td>${event.tipo || "—"}</td>
            <td>${event.fecha || "—"}</td>
            <td>${event.hora_inicio || "00:00"} - ${
          event.hora_fin || "00:00"
        }</td>
            <td>${event.lugar || "Sin lugar definido"}</td>
            <td>${event.empresa_patrocinadora || "Sin patrocinador"}</td>
            <td class="actions-column">
              <div class="smart-menu" data-menu>
                <button
                  type="button"
                  class="btn btn-icon"
                  data-menu-toggle
                  aria-haspopup="true"
                  aria-expanded="false"
                  aria-label="Mostrar acciones del evento"
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
                <div class="smart-menu__list" hidden>
                  <div class="smart-menu__split">
                    <button class="smart-menu__item" data-action="view" data-id="${event.id}">Ver</button>
                    <button
                      type="button"
                      class="smart-menu__icon-btn"
                      data-action="edit"
                      data-id="${event.id}"
                      aria-label="Editar evento"
                      title="Editar evento"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M15.232 5.232a3 3 0 0 1 4.243 4.243l-9.193 9.192a1 1 0 0 1-.53.28l-4 0.8a1 1 0 0 1-1.18-1.18l0.8-4a1 1 0 0 1 .28-.53l9.193-9.193zm2.828 1.415a1 1 0 0 0-1.414 0L9 14.293V15h0.707l7.646-7.646a1 1 0 0 0 0-1.414zM7.586 16 7 18.414 9.414 17.828 9.999 17.242V16H7.586z"/>
                      </svg>
                    </button>
                  </div>
                  <button class="smart-menu__item" data-action="attendance" data-id="${
                    event.id
                  }">Registrar asistencia</button>
                  <button class="smart-menu__item" data-action="acta" data-id="${
                    event.id
                  }">Acta PDF</button>
                </div>
              </div>
            </td>
          </tr>
        `
      )
      .join("");
  };

  const handleAction = async (action, eventId) => {
    closeAllMenus();
    switch (action) {
      case "edit":
        sessionStorage.setItem("eventia:editEventId", String(eventId));
        window.location.href = "../evento/index.html";
        break;
      case "attendance":
        sessionStorage.setItem("eventia:attendanceEventId", String(eventId));
        window.location.href = "../asistencia/index.html";
        break;
      case "view":
        sessionStorage.setItem("eventia:viewEventId", String(eventId));
        window.location.href = "../evento/index.html?mode=view";
        break;
      case "acta":
        try {
          const button = document.querySelector(
            `button[data-action="acta"][data-id="${eventId}"]`
          );
          if (button) {
            button.disabled = true;
            button.textContent = "Generando...";
          }
          const blob = await API.descargarActaEvento(eventId);
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `acta_evento_${eventId}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Error al generar acta PDF", error);
          alert(error.message || "No fue posible generar el acta del evento.");
        } finally {
          const button = document.querySelector(
            `button[data-action="acta"][data-id="${eventId}"]`
          );
          if (button) {
            button.disabled = false;
            button.textContent = "Acta PDF";
          }
        }
        break;
      default:
        break;
    }
  };

  if (userEventsTableBody) {
    userEventsTableBody.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-menu-toggle]");
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const menu = toggle
          .closest(".smart-menu")
          ?.querySelector(".smart-menu__list");
        if (!menu) return;
        const shouldOpen = menu.hidden;
        closeAllMenus(menu);
        setMenuVisibility(menu, shouldOpen);
        return;
      }

      const target = event.target.closest("button[data-action][data-id]");
      if (!target) return;
      closeAllMenus();
      const action = target.dataset.action;
      const eventId = Number(target.dataset.id);
      if (!eventId || Number.isNaN(eventId)) return;
      handleAction(action, eventId);
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".smart-menu")) {
      closeAllMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllMenus();
    }
  });

  const boot = async () => {
    await fetchClientName();
    await loadEvents();
    await loadAssistances();
    renderStats();
    renderEvents();
  };

  boot();
});
