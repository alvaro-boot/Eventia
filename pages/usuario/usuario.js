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
  const setMenuVisibility = (menu, visible) => {
    if (!menu) return;
    menu.hidden = !visible;
    const toggle = menu
      .closest(".smart-menu")
      ?.querySelector("[data-menu-toggle]");
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

  const parseEventDate = (event) => {
    try {
      return new Date(`${event.fecha}T${event.hora_inicio || "00:00"}`);
    } catch (error) {
      return new Date(event.fecha);
    }
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
      <p>${upcoming.fecha} • ${upcoming.hora_inicio || "00:00"} • ${
      upcoming.empresa_patrocinadora || "Sin patrocinador"
    }</p>
      <p>${upcoming.lugar || "Sin lugar definido"}</p>
      <p class="timer"></p>
    `;

    const timerElement = nextEventInfo.querySelector(".timer");
    const updateTimer = () => {
      const diff = nextDate - new Date();
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
                  <button class="smart-menu__item" data-action="attendance" data-id="${
                    event.id
                  }">Registrar asistencia</button>
                  <button class="smart-menu__item" data-action="view" data-id="${
                    event.id
                  }">Ver</button>
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
