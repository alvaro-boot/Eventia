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
    menu.classList.remove("smart-menu__list--top");
    
    // Primero mostrar el menú para calcular su tamaño
    const wasHidden = menu.hidden;
    menu.hidden = false;
    
    const menuRect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    
    // Verificar si el menú se sale por abajo
    if (menuRect.bottom > viewportHeight) {
      // Mostrar arriba si no cabe abajo
      menu.classList.add("smart-menu__list--top");
    }
    
    // Verificar si se sale por la derecha
    if (menuRect.right > viewportWidth) {
      menu.style.right = "0";
      menu.style.left = "auto";
    } else {
      menu.style.right = "0";
      menu.style.left = "auto";
    }
    
    // Verificar si se sale por la izquierda
    if (menuRect.left < 0) {
      menu.style.left = "0";
      menu.style.right = "auto";
    }
    
    if (wasHidden) {
      menu.hidden = true;
    }
  };

  const setMenuVisibility = (menu, visible) => {
    if (!menu) return;
    if (!visible) {
      menu.hidden = true;
      menu.classList.remove("smart-menu__list--top");
      menu.style.right = "";
      menu.style.left = "";
    } else {
      // Mostrar primero para calcular posición
      menu.hidden = false;
      // Pequeño delay para asegurar que el DOM esté actualizado antes de calcular
      setTimeout(() => {
        adjustMenuPosition(menu);
      }, 10);
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
      const months = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic"
      ];
      const day = eventDate.getDate();
      const month = months[eventDate.getMonth()];
      const year = eventDate.getFullYear();
      return `${day} de ${month} de ${year}`;
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
    const hour = Number(hours);
    const minute = Number(minutes);
    const period = hour >= 12 ? "p.m." : "a.m.";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${String(displayHour).padStart(2, "0")}:${minutes} ${period}`;
  };

  const formatTimeRange = (startTime, endTime) => {
    if (!startTime && !endTime) return "—";
    const start = formatTimeLabel(startTime);
    const end = endTime ? formatTimeLabel(endTime) : "";
    return end ? `${start} - ${end}` : start;
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
    )}</p>
      <p>${upcoming.empresa_patrocinadora || "Sin patrocinador"}</p>
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

  let selectedEventId = null;

  const updateActionButtons = () => {
    const viewEditBtn = document.getElementById("viewEditEventBtn");
    const markArrivalBtn = document.getElementById("markArrivalModalBtn");
    const attendanceBtn = document.getElementById("attendanceEventBtn");
    const excelBtn = document.getElementById("downloadExcelBtn");
    const pdfBtn = document.getElementById("generatePdfBtn");

    const hasSelection = selectedEventId !== null;

    if (viewEditBtn) viewEditBtn.disabled = !hasSelection;
    if (markArrivalBtn) markArrivalBtn.disabled = !hasSelection;
    if (attendanceBtn) attendanceBtn.disabled = !hasSelection;
    if (excelBtn) excelBtn.disabled = !hasSelection;
    if (pdfBtn) pdfBtn.disabled = !hasSelection;
  };

  const renderEvents = () => {
    if (!userEventsTableBody) return;

    if (!events.length) {
      userEventsTableBody.innerHTML = `
        <tr>
          <td colspan="7">No hay eventos registrados.</td>
        </tr>
      `;
      selectedEventId = null;
      updateActionButtons();
      return;
    }

    userEventsTableBody.innerHTML = events
      .map(
        (event) => `
          <tr>
            <td data-label="Seleccionar">
              <input type="radio" name="eventSelection" value="${event.id}" class="event-radio" />
            </td>
            <td data-label="Nombre">${event.nombre}</td>
            <td data-label="Tipo" class="hide-mobile">${event.tipo || "—"}</td>
            <td data-label="Fecha" class="hide-mobile">${formatDateLabel(parseEventDate(event), event.fecha)}</td>
            <td data-label="Hora" class="hide-mobile">${formatTimeRange(event.hora_inicio, event.hora_fin)}</td>
            <td data-label="Lugar" class="hide-mobile">${event.lugar || "Sin lugar definido"}</td>
            <td data-label="Patrocinador">${event.empresa_patrocinadora || "Sin patrocinador"}</td>
          </tr>
        `
      )
      .join("");

    // Agregar event listeners a los radio buttons
    const radioButtons = userEventsTableBody.querySelectorAll(".event-radio");
    radioButtons.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          selectedEventId = Number(e.target.value);
          // Agregar clase a la fila seleccionada para el estilo
          const rows = userEventsTableBody.querySelectorAll("tr");
          rows.forEach((row) => row.classList.remove("selected"));
          e.target.closest("tr")?.classList.add("selected");
          updateActionButtons();
        }
      });
    });
    
    // Marcar la fila seleccionada inicialmente si hay un evento seleccionado
    if (selectedEventId) {
      const selectedRadio = userEventsTableBody.querySelector(`input[value="${selectedEventId}"]`);
      if (selectedRadio && selectedRadio.checked) {
        selectedRadio.closest("tr")?.classList.add("selected");
      }
    }

    updateActionButtons();
  };

  // Función para generar Excel con lista de asistentes
  const generateExcelForEvent = async (eventId) => {
    if (typeof XLSX === "undefined") {
      throw new Error("La librería XLSX no está cargada. Por favor, recarga la página.");
    }

    try {
      // Obtener datos del evento
      const event = events.find((e) => Number(e.id) === Number(eventId));
      if (!event) {
        throw new Error("Evento no encontrado");
      }

      // Obtener lista de asistentes
      const response = await API.listarAsistencia(eventId);
      const assistances = toArray(response, "asistencias");

      if (!assistances || assistances.length === 0) {
        alert("No hay asistentes registrados para este evento.");
        return;
      }

      // Preparar datos para Excel
      const excelData = assistances.map((assist, index) => ({
        "#": index + 1,
        "Número de Identidad": assist.numero_identificacion || "",
        "Nombres": assist.nombres || "",
        "Apellidos": assist.apellidos || "",
        "Nombre Completo": `${assist.nombres || ""} ${assist.apellidos || ""}`.trim(),
        "Correo Electrónico": assist.correo_electronico || "",
        "Número Celular": assist.numero_celular || "",
        "Empresa": assist.empresa || "",
        "Cargo": assist.cargo || "",
        "Estado": Number(assist.asiste) === 1 ? "Asistió" : "Pendiente",
        "Invitado": Number(assist.invitado) === 1 ? "Sí" : "No",
        "Fecha de Registro": assist.created_at ? new Date(assist.created_at).toLocaleDateString("es-ES") : "",
      }));

      // Crear workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Ajustar ancho de columnas
      const colWidths = [
        { wch: 5 },   // #
        { wch: 18 }, // Número de Identidad
        { wch: 20 }, // Nombres
        { wch: 20 }, // Apellidos
        { wch: 30 }, // Nombre Completo
        { wch: 25 }, // Correo Electrónico
        { wch: 15 }, // Número Celular
        { wch: 20 }, // Empresa
        { wch: 20 }, // Cargo
        { wch: 12 }, // Estado
        { wch: 10 }, // Invitado
        { wch: 18 }, // Fecha de Registro
      ];
      ws["!cols"] = colWidths;

      // Agregar hoja al workbook
      XLSX.utils.book_append_sheet(wb, ws, "Asistentes");

      // Generar archivo y descargar
      const fileName = `Lista_Asistentes_${event.nombre.replace(/[^a-z0-9]/gi, "_")}_${eventId}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error("Error al generar Excel:", error);
      throw error;
    }
  };

  // Función para generar PDF con información del evento
  const generatePdfForEvent = async (eventId) => {
    if (typeof window.jspdf === "undefined") {
      throw new Error("La librería jsPDF no está cargada. Por favor, recarga la página.");
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      // Obtener datos del evento
      let event = events.find((e) => Number(e.id) === Number(eventId));
      if (!event) {
        // Si no está en cache, cargarlo
        const eventData = await loadEventData(eventId);
        if (!eventData) {
          throw new Error("Evento no encontrado");
        }
        event = eventData;
      }

      // Obtener lista de asistentes
      const response = await API.listarAsistencia(eventId);
      const assistances = toArray(response, "asistencias");

      // Configuración de página
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let yPos = margin;

      // Título
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Informe de Evento", margin, yPos);
      yPos += 10;

      // Línea separadora
      doc.setDrawColor(77, 106, 255);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      // Información del evento
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Información del Evento", margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const eventInfo = [
        `Nombre: ${event.nombre || "N/A"}`,
        `Tipo: ${event.tipo || "N/A"}`,
        `Empresa Patrocinadora: ${event.empresa_patrocinadora || "N/A"}`,
        `Fecha: ${event.fecha ? new Date(event.fecha).toLocaleDateString("es-ES") : "N/A"}`,
        `Hora de Inicio: ${event.hora_inicio || "N/A"}`,
        `Hora de Fin: ${event.hora_fin || "N/A"}`,
        `Lugar: ${event.lugar || "N/A"}`,
        `Número de Invitados: ${event.numero_invitados || 0}`,
        `Encargados: ${event.encargados || "N/A"}`,
      ];

      eventInfo.forEach((info) => {
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }
        doc.text(info, margin + 5, yPos);
        yPos += 6;
      });

      yPos += 5;

      // Descripción
      if (event.descripcion) {
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.text("Descripción:", margin, yPos);
        yPos += 6;
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(event.descripcion, maxWidth - 10);
        descLines.forEach((line) => {
          if (yPos > pageHeight - 30) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(line, margin + 5, yPos);
          yPos += 6;
        });
        yPos += 5;
      }

      // Línea separadora
      if (yPos > pageHeight - 50) {
        doc.addPage();
        yPos = margin;
      }
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      // Lista de participantes
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Lista de Participantes", margin, yPos);
      yPos += 8;

      if (assistances && assistances.length > 0) {
        // Estadísticas
        const totalAsistentes = assistances.length;
        const asistieron = assistances.filter((a) => Number(a.asiste) === 1).length;
        const pendientes = totalAsistentes - asistieron;
        const invitados = assistances.filter((a) => Number(a.invitado) === 1).length;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const stats = [
          `Total de asistentes: ${totalAsistentes}`,
          `Asistieron: ${asistieron}`,
          `Pendientes: ${pendientes}`,
          `Invitados: ${invitados}`,
        ];

        stats.forEach((stat) => {
          if (yPos > pageHeight - 30) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(stat, margin + 5, yPos);
          yPos += 6;
        });

        yPos += 5;

        // Tabla de asistentes
        const tableHeaders = ["#", "Identidad", "Nombre Completo", "Correo", "Estado"];
        const colWidths = [10, 30, 60, 50, 30];
        const startX = margin;

        // Encabezados de tabla
        if (yPos > pageHeight - 30) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFont("helvetica", "bold");
        let xPos = startX;
        tableHeaders.forEach((header, i) => {
          doc.text(header, xPos, yPos);
          xPos += colWidths[i];
        });
        yPos += 8;

        // Filas de datos
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        assistances.forEach((assist, index) => {
          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = margin;
            // Redibujar encabezados
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            xPos = startX;
            tableHeaders.forEach((header, i) => {
              doc.text(header, xPos, yPos);
              xPos += colWidths[i];
            });
            yPos += 8;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
          }

          const nombreCompleto = `${assist.nombres || ""} ${assist.apellidos || ""}`.trim();
          const estado = Number(assist.asiste) === 1 ? "Asistió" : "Pendiente";
          const rowData = [
            String(index + 1),
            assist.numero_identificacion || "",
            nombreCompleto || "N/A",
            assist.correo_electronico || "",
            estado,
          ];

          xPos = startX;
          rowData.forEach((data, i) => {
            const text = doc.splitTextToSize(String(data), colWidths[i] - 2);
            doc.text(text[0] || "", xPos, yPos);
            xPos += colWidths[i];
          });
          yPos += 7;
        });
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("No hay asistentes registrados para este evento.", margin + 5, yPos);
      }

      // Pie de página
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Página ${i} de ${totalPages} - Generado el ${new Date().toLocaleDateString("es-ES")}`,
          pageWidth - margin,
          pageHeight - 10,
          { align: "right" }
        );
      }

      // Descargar PDF
      const fileName = `Informe_Evento_${event.nombre.replace(/[^a-z0-9]/gi, "_")}_${eventId}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      throw error;
    }
  };

  const handleAction = async (action, eventId) => {
    if (!eventId) return;

    switch (action) {
      case "attendance":
        sessionStorage.setItem("eventia:attendanceEventId", String(eventId));
        window.location.href = "../asistencia/index.html";
        break;
      case "excel":
        try {
          const button = document.getElementById("downloadExcelBtn");
          if (button) {
            button.disabled = true;
            button.textContent = "Descargando...";
          }
          console.log("Iniciando generación de Excel para evento:", eventId);
          await generateExcelForEvent(eventId);
          console.log("Descarga completada exitosamente");
        } catch (error) {
          console.error("Error completo al descargar Excel:", error);
          const errorMessage = error?.message || "Error desconocido";
          alert(`Error al descargar la lista de asistentes: ${errorMessage}`);
        } finally {
          const button = document.getElementById("downloadExcelBtn");
          if (button) {
            button.disabled = false;
            button.textContent = "Descargar Excel";
          }
        }
        break;
      case "acta":
        try {
          const button = document.getElementById("generatePdfBtn");
          if (button) {
            button.disabled = true;
            button.textContent = "Generando...";
          }
          console.log("Iniciando generación de PDF para evento:", eventId);
          await generatePdfForEvent(eventId);
          console.log("Generación de PDF completada exitosamente");
        } catch (error) {
          console.error("Error completo al generar PDF:", error);
          const errorMessage = error?.message || "Error desconocido";
          alert(`Error al generar el PDF del evento: ${errorMessage}`);
        } finally {
          const button = document.getElementById("generatePdfBtn");
          if (button) {
            button.disabled = false;
            button.textContent = "Generar PDF";
          }
        }
        break;
      default:
        break;
    }
  };

  // Variables para el modal de ver/editar evento
  const viewEditEventModal = document.getElementById("viewEditEventModal");
  const closeViewEditEventModal = document.getElementById("closeViewEditEventModal");
  const cancelViewEditEventBtn = document.getElementById("cancelViewEditEventBtn");
  const toggleEditModeBtn = document.getElementById("toggleEditModeBtn");
  const saveEventBtn = document.getElementById("saveEventBtn");
  const viewEditEventForm = document.getElementById("viewEditEventForm");
  const viewEditEventModalTitle = document.getElementById("viewEditEventModalTitle");
  const loadingOverlayEvent = document.getElementById("loadingOverlayEvent");
  let isEditMode = false;
  let currentEventId = null;
  
  const loadEventData = async (eventId) => {
    if (!eventId) return null;
    try {
      const response = await API.listarEvento(CLIENT_ID, eventId);
      // La respuesta puede venir en diferentes formatos
      const event = response?.evento || response?.data || response;
      return event;
    } catch (error) {
      console.error("Error al cargar evento", error);
      return null;
    }
  };
  
  const formatDateForInput = (dateString) => {
    if (!dateString) return "";
    // Si ya está en formato YYYY-MM-DD, devolverlo
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }
    // Si viene en formato DD/MM/YYYY o similar, convertir
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.warn("Error al formatear fecha", e);
    }
    // Si tiene formato de fecha con T, extraer solo la parte de fecha
    if (dateString.includes("T")) {
      return dateString.split("T")[0];
    }
    return dateString;
  };
  
  const populateEventForm = (event) => {
    if (!event) {
      console.error("No se recibió evento para poblar el formulario");
        return;
      }

    console.log("Evento recibido:", event);
    
    const modalEventId = document.getElementById("modalEventId");
    const modalEventType = document.getElementById("modalEventType");
    const modalEventSponsor = document.getElementById("modalEventSponsor");
    const modalEventName = document.getElementById("modalEventName");
    const modalEventManagers = document.getElementById("modalEventManagers");
    const modalEventDescription = document.getElementById("modalEventDescription");
    const modalEventGuests = document.getElementById("modalEventGuests");
    const modalEventDate = document.getElementById("modalEventDate");
    const modalEventStartTime = document.getElementById("modalEventStartTime");
    const modalEventEndTime = document.getElementById("modalEventEndTime");
    const modalEventLocation = document.getElementById("modalEventLocation");
    
    if (modalEventId) modalEventId.value = event.id || "";
    if (modalEventType) modalEventType.value = event.tipo || "";
    if (modalEventSponsor) modalEventSponsor.value = event.empresa_patrocinadora || "";
    if (modalEventName) modalEventName.value = event.nombre || "";
    if (modalEventManagers) modalEventManagers.value = event.encargados || "";
    if (modalEventDescription) modalEventDescription.value = event.descripcion || "";
    if (modalEventGuests) modalEventGuests.value = event.numero_invitados ?? "";
    if (modalEventDate) modalEventDate.value = formatDateForInput(event.fecha || "");
    if (modalEventStartTime) modalEventStartTime.value = event.hora_inicio || "";
    if (modalEventEndTime) modalEventEndTime.value = event.hora_fin || "";
    if (modalEventLocation) modalEventLocation.value = event.lugar || "";
  };
  
  const setEditMode = (enabled) => {
    isEditMode = enabled;
    const fields = viewEditEventForm.querySelectorAll("input, textarea");
    fields.forEach((field) => {
      field.disabled = !enabled;
    });
    
    if (enabled) {
      viewEditEventModalTitle.textContent = "Editar evento";
      toggleEditModeBtn.textContent = "Cancelar edición";
      saveEventBtn.hidden = false;
    } else {
      viewEditEventModalTitle.textContent = "Ver evento";
      toggleEditModeBtn.textContent = "Editar";
      saveEventBtn.hidden = true;
    }
  };
  
  const openViewEditEventModal = async () => {
    if (!viewEditEventModal || !selectedEventId) return;
    
    currentEventId = selectedEventId;
    viewEditEventModal.hidden = false;
    setEditMode(false);
    
    if (loadingOverlayEvent) loadingOverlayEvent.hidden = false;
    
    try {
      const event = await loadEventData(selectedEventId);
      if (event) {
        populateEventForm(event);
      } else {
        console.error("No se pudo cargar el evento");
      }
    } catch (error) {
      console.error("Error al cargar evento", error);
    } finally {
      if (loadingOverlayEvent) loadingOverlayEvent.hidden = true;
    }
  };
  
  const closeViewEditEventModalFunc = () => {
    if (!viewEditEventModal) return;
    viewEditEventModal.hidden = true;
    setEditMode(false);
    if (viewEditEventForm) {
      viewEditEventForm.reset();
    }
    currentEventId = null;
  };
  
  const handleSaveEvent = async () => {
    if (!currentEventId || !viewEditEventForm) return;
    
    const formData = new FormData(viewEditEventForm);
    const payload = {
      tipo: formData.get("eventType"),
      empresa_patrocinadora: formData.get("eventSponsor"),
      nombre: formData.get("eventName"),
      encargados: formData.get("eventManagers"),
      descripcion: formData.get("eventDescription"),
      numero_invitados: Number(formData.get("eventGuests")),
      fecha: formData.get("eventDate"),
      hora_inicio: formData.get("eventStartTime"),
      hora_fin: formData.get("eventEndTime"),
      lugar: formData.get("eventLocation"),
    };
    
    if (loadingOverlayEvent) loadingOverlayEvent.hidden = false;
    if (saveEventBtn) {
      saveEventBtn.disabled = true;
      saveEventBtn.textContent = "Guardando...";
    }
    
    try {
      await API.actualizarEvento(CLIENT_ID, currentEventId, payload);
      closeViewEditEventModalFunc();
      renderEvents();
    } catch (error) {
      console.error("Error al actualizar evento", error);
      const messageEl = document.getElementById("modalEventMessage");
      if (messageEl) {
        messageEl.textContent = error.message || "Error al guardar el evento";
        messageEl.classList.remove("hidden", "success");
        messageEl.classList.add("error");
      }
    } finally {
      if (loadingOverlayEvent) loadingOverlayEvent.hidden = true;
      if (saveEventBtn) {
        saveEventBtn.disabled = false;
        saveEventBtn.textContent = "Guardar cambios";
      }
    }
  };

  // Elementos de modales
  const markArrivalModalBtn = document.getElementById("markArrivalModalBtn");
  const markArrivalModal = document.getElementById("markArrivalModal");
  const closeMarkArrivalModal = document.getElementById("closeMarkArrivalModal");
  const cancelMarkArrivalBtn = document.getElementById("cancelMarkArrivalBtn");
  const selectAttendeeModal = document.getElementById("selectAttendeeModal");
  const markArrivalBtn = document.getElementById("markArrivalBtn");
  const loadingOverlayArrival = document.getElementById("loadingOverlayArrival");

  const registerAttendanceModal = document.getElementById("registerAttendanceModal");
  const closeRegisterAttendanceModal = document.getElementById("closeRegisterAttendanceModal");
  const cancelRegisterAttendanceBtn = document.getElementById("cancelRegisterAttendanceBtn");
  const attendanceFormModal = document.getElementById("attendanceFormModal");
  const submitAttendanceModalBtn = document.getElementById("submitAttendanceModalBtn");
  const loadingOverlayRegister = document.getElementById("loadingOverlayRegister");

  let cachedAssistances = [];
  let signatureCtxArrival = null;
  let isSignatureDrawingArrival = false;
  let signatureIsDirtyArrival = false;
  
  // Variables para el canvas de firma del modal de registro
  let signatureCtxRegister = null;
  let isSignatureDrawingRegister = false;
  let signatureIsDirtyRegister = false;

  // Funciones para manejar "Marcar llegada"
  const updateAttendeeSelector = async () => {
    if (!selectAttendeeModal || !selectedEventId) return;
    try {
      selectAttendeeModal.innerHTML = '<option value="">Cargando asistentes...</option>';
      const response = await API.listarAsistencia(selectedEventId);
      const assistances = toArray(response, "asistencias");
      cachedAssistances = assistances.map((a) => ({
        id: a.id,
        numero_identificacion: a.numero_identificacion,
        nombres: a.nombres,
        apellidos: a.apellidos,
        asiste: Number(a.asiste) === 1,
      }));

      const pendingAssistances = cachedAssistances.filter((a) => !a.asiste);
      if (pendingAssistances.length === 0) {
        selectAttendeeModal.innerHTML = '<option value="">No hay asistentes pendientes</option>';
        if (markArrivalBtn) markArrivalBtn.disabled = true;
      } else {
        selectAttendeeModal.innerHTML = '<option value="">Selecciona un asistente...</option>' +
          pendingAssistances.map((assist) => 
            `<option value="${assist.id}">${assist.nombres} ${assist.apellidos} - ${assist.numero_identificacion}</option>`
          ).join("");
        if (markArrivalBtn && !selectAttendeeModal.value) {
          markArrivalBtn.disabled = true;
        }
      }
    } catch (error) {
      console.error("Error al cargar asistencias", error);
      selectAttendeeModal.innerHTML = '<option value="">Error al cargar asistentes</option>';
      if (markArrivalBtn) markArrivalBtn.disabled = true;
    }
  };

  const openMarkArrivalModal = () => {
    if (!markArrivalModal || !selectedEventId) return;
    markArrivalModal.hidden = false;
    updateAttendeeSelector();
    setTimeout(() => {
      initSignaturePadArrival();
    }, 100);
  };

  const closeMarkArrivalModalFunc = () => {
    if (!markArrivalModal) return;
    markArrivalModal.hidden = true;
    if (selectAttendeeModal) selectAttendeeModal.value = "";
    if (markArrivalBtn) markArrivalBtn.disabled = true;
  };

  const blobToBase64 = (blob) =>
    new Promise((resolve) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
        resolve(base64Data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

  // Función para optimizar y comprimir la firma - devuelve base64 directamente
  const optimizeSignature = (canvas) => {
    return new Promise((resolve) => {
      if (!canvas) {
        resolve(null);
        return;
      }

      try {
        // Función recursiva para reducir hasta que quepa en la BD (máximo 500 caracteres)
        const compressToFit = (sourceCanvas, width, height, quality, maxSize = 500) => {
          const tempCanvas = document.createElement("canvas");
          const tempCtx = tempCanvas.getContext("2d");
          
          tempCanvas.width = width;
          tempCanvas.height = height;
          
          // Dibujar la imagen redimensionada con fondo blanco
          tempCtx.fillStyle = "#FFFFFF";
          tempCtx.fillRect(0, 0, width, height);
          tempCtx.drawImage(sourceCanvas, 0, 0, width, height);
          
          // Convertir a JPEG con calidad reducida
          const dataUrl = tempCanvas.toDataURL("image/jpeg", quality);
          const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          
          console.log(`Firma optimizada: ${width}x${height}, calidad ${quality.toFixed(2)}, base64 = ${base64Data.length} caracteres`);
          
          // Si aún es muy grande y podemos reducir más, intentar con tamaño/calidad menor
          if (base64Data.length > maxSize) {
            if (width > 60 && height > 30) {
              // Reducir tamaño primero
              return compressToFit(sourceCanvas, Math.floor(width * 0.75), Math.floor(height * 0.75), quality, maxSize);
            } else if (quality > 0.1) {
              // Reducir calidad
              return compressToFit(sourceCanvas, width, height, Math.max(0.1, quality * 0.6), maxSize);
            } else if (quality > 0.05) {
              // Última reducción de calidad
              return compressToFit(sourceCanvas, width, height, 0.05, maxSize);
            } else if (width > 50 && height > 25) {
              // Última reducción de tamaño
              return compressToFit(sourceCanvas, 50, 25, 0.05, maxSize);
            }
          }
          
          return base64Data;
        };
        
        // Empezar con un tamaño pequeño y calidad baja para asegurar que quepa
        const base64Data = compressToFit(canvas, 120, 60, 0.25, 500);
        
        if (base64Data && base64Data.length <= 500) {
          // Convertir base64 a blob para mantener compatibilidad con el código existente
          try {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "image/jpeg" });
            console.log(`Firma final: blob = ${blob.size} bytes, base64 = ${base64Data.length} caracteres`);
            resolve(blob);
          } catch (error) {
            console.error("Error al convertir base64 a blob:", error);
            resolve(null);
          }
        } else {
          console.warn(`Firma aún muy grande después de optimización: ${base64Data?.length || 0} caracteres`);
          resolve(null);
        }
      } catch (error) {
        console.error("Error al optimizar firma:", error);
        resolve(null);
      }
    });
  };

  const getSignatureBlobArrival = () => {
    const signatureCanvasArrival = document.getElementById("signatureCanvasArrival");
    if (!signatureCanvasArrival) {
      return Promise.resolve(null);
    }
    return optimizeSignature(signatureCanvasArrival);
  };

  const handleMarkArrival = async () => {
    if (!selectedEventId || !selectAttendeeModal || !selectAttendeeModal.value) return;

    const asistenciaId = Number(selectAttendeeModal.value);
    if (!asistenciaId) return;

    let signatureBase64 = null;
    const signatureCanvasArrival = document.getElementById("signatureCanvasArrival");
    if (signatureCanvasArrival && signatureIsDirtyArrival) {
      const signatureBlob = await getSignatureBlobArrival();
      if (signatureBlob) {
        signatureBase64 = await blobToBase64(signatureBlob);
        // Validar que el base64 no exceda 500 caracteres
        if (signatureBase64 && signatureBase64.length > 500) {
          console.warn(`Firma demasiado grande (${signatureBase64.length} caracteres), truncando...`);
          signatureBase64 = signatureBase64.substring(0, 500);
        }
      }
    }

    if (loadingOverlayArrival) loadingOverlayArrival.hidden = false;
    if (markArrivalBtn) {
      markArrivalBtn.disabled = true;
      markArrivalBtn.textContent = "Marcando...";
    }

    try {
      await API.marcarLlegada(selectedEventId, asistenciaId, {
        firma: signatureBase64,
      });
      selectAttendeeModal.value = "";
      if (markArrivalBtn) markArrivalBtn.disabled = true;
      closeMarkArrivalModalFunc();
      renderEvents();
    } catch (error) {
      console.error("Error al marcar llegada", error);
      alert(`Error al marcar la llegada: ${error.message || "Error desconocido"}`);
    } finally {
      if (loadingOverlayArrival) loadingOverlayArrival.hidden = true;
      if (markArrivalBtn) {
        markArrivalBtn.disabled = false;
        markArrivalBtn.textContent = "Marcar llegada";
      }
    }
  };

  // Funciones para manejar "Registrar asistencia"
  const openRegisterAttendanceModal = () => {
    if (!registerAttendanceModal || !selectedEventId) return;
    registerAttendanceModal.hidden = false;
    if (attendanceFormModal) {
      attendanceFormModal.reset();
    }
    setTimeout(() => {
      initSignaturePadRegister();
    }, 100);
  };

  const closeRegisterAttendanceModalFunc = () => {
    if (!registerAttendanceModal) return;
    registerAttendanceModal.hidden = true;
    if (attendanceFormModal) {
      attendanceFormModal.reset();
    }
    const signatureCanvasRegister = document.getElementById("signatureCanvasRegister");
    if (signatureCanvasRegister && signatureCtxRegister) {
      signatureCtxRegister.clearRect(0, 0, signatureCanvasRegister.width, signatureCanvasRegister.height);
      signatureIsDirtyRegister = false;
    }
  };

  const getSignatureBlobRegister = () => {
    const signatureCanvasRegister = document.getElementById("signatureCanvasRegister");
    if (!signatureCanvasRegister) {
      return Promise.resolve(null);
    }
    return optimizeSignature(signatureCanvasRegister);
  };

  const initSignaturePadRegister = () => {
    const signatureCanvasRegister = document.getElementById("signatureCanvasRegister");
    if (!signatureCanvasRegister) return;

    signatureCtxRegister = signatureCanvasRegister.getContext("2d");
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    signatureCanvasRegister.width = 300 * ratio;
    signatureCanvasRegister.height = 400 * ratio;
    signatureCtxRegister.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtxRegister.scale(ratio, ratio);
    signatureCtxRegister.lineCap = "round";
    signatureCtxRegister.lineJoin = "round";
    signatureCtxRegister.lineWidth = 2;
    signatureCtxRegister.strokeStyle = "#4d6aff";

    const getPoint = (e) => {
      const rect = signatureCanvasRegister.getBoundingClientRect();
      return {
        x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
        y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top,
      };
    };

    signatureCanvasRegister.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const point = getPoint(e);
      signatureCtxRegister.beginPath();
      signatureCtxRegister.moveTo(point.x, point.y);
      isSignatureDrawingRegister = true;
      signatureIsDirtyRegister = true;
    });

    signatureCanvasRegister.addEventListener("pointermove", (e) => {
      if (!isSignatureDrawingRegister) return;
      e.preventDefault();
      const point = getPoint(e);
      signatureCtxRegister.lineTo(point.x, point.y);
      signatureCtxRegister.stroke();
    });

    signatureCanvasRegister.addEventListener("pointerup", () => {
      isSignatureDrawingRegister = false;
    });

    signatureCanvasRegister.addEventListener("pointerleave", () => {
      isSignatureDrawingRegister = false;
    });

    const signatureClearBtnRegister = document.getElementById("signatureClearBtnRegister");
    if (signatureClearBtnRegister) {
      signatureClearBtnRegister.addEventListener("click", () => {
        signatureCtxRegister.clearRect(0, 0, signatureCanvasRegister.width, signatureCanvasRegister.height);
        signatureIsDirtyRegister = false;
      });
    }
  };

  const handleRegisterAttendance = async () => {
    if (!selectedEventId || !attendanceFormModal) return;

    const currentSession = Auth.getSession();
    if (!currentSession) return;

    const formValues = {
      numero_identificacion: document.getElementById("attendeeDocumentModal")?.value.trim() || "",
      nombres: document.getElementById("attendeeFirstNameModal")?.value.trim() || "",
      apellidos: document.getElementById("attendeeLastNameModal")?.value.trim() || "",
      correo_electronico: document.getElementById("attendeeEmailModal")?.value.trim() || "",
      numero_celular: document.getElementById("attendeePhoneModal")?.value.trim() || "",
      cargo: document.getElementById("attendeeRoleModal")?.value.trim() || "",
      empresa: document.getElementById("attendeeCompanyModal")?.value.trim() || "",
      invitado: document.getElementById("attendeeGuestModal")?.value || "0",
    };

    const requiredFields = ["numero_identificacion", "nombres", "apellidos"];
    const missing = requiredFields.filter((field) => !formValues[field]);
    if (missing.length) {
      return;
    }

    let signatureBase64 = null;
    const signatureCanvasRegister = document.getElementById("signatureCanvasRegister");
    if (signatureCanvasRegister && signatureIsDirtyRegister) {
      const signatureBlob = await getSignatureBlobRegister();
      if (signatureBlob) {
        signatureBase64 = await blobToBase64(signatureBlob);
        // Validar que el base64 no exceda 500 caracteres
        if (signatureBase64 && signatureBase64.length > 500) {
          console.warn(`Firma demasiado grande (${signatureBase64.length} caracteres), truncando...`);
          signatureBase64 = signatureBase64.substring(0, 500);
        }
      }
    }

    const submitData = new FormData();
    submitData.append("evento_id", selectedEventId);
    submitData.append("user_id", currentSession.id);
    submitData.append("numero_identificacion", formValues.numero_identificacion);
    submitData.append("nombres", formValues.nombres);
    submitData.append("apellidos", formValues.apellidos);
    submitData.append("correo_electronico", formValues.correo_electronico);
    submitData.append("numero_celular", formValues.numero_celular);
    submitData.append("cargo", formValues.cargo);
    submitData.append("empresa", formValues.empresa);
    submitData.append("invitado", formValues.invitado);
    submitData.append("asiste", "1");
    submitData.append("estado_id", "1");
    
    if (signatureBase64) {
      submitData.append("firma", signatureBase64);
    }

    if (loadingOverlayRegister) loadingOverlayRegister.hidden = false;
    if (submitAttendanceModalBtn) {
      submitAttendanceModalBtn.disabled = true;
      submitAttendanceModalBtn.textContent = "Registrando...";
    }

    try {
      await API.registrarAsistencia(selectedEventId, submitData);
      closeRegisterAttendanceModalFunc();
      renderEvents();
    } catch (error) {
      console.error("Error al registrar asistencia", error);
    } finally {
      if (loadingOverlayRegister) loadingOverlayRegister.hidden = true;
      if (submitAttendanceModalBtn) {
        submitAttendanceModalBtn.disabled = false;
        submitAttendanceModalBtn.textContent = "Registrar";
      }
    }
  };

  // Event listeners para los botones de acción
  const viewEditBtn = document.getElementById("viewEditEventBtn");
  const attendanceBtn = document.getElementById("attendanceEventBtn");
  const excelBtn = document.getElementById("downloadExcelBtn");
  const pdfBtn = document.getElementById("generatePdfBtn");

  if (viewEditBtn) {
    viewEditBtn.addEventListener("click", () => {
      if (selectedEventId) {
        openViewEditEventModal();
      }
    });
  }
  
  if (excelBtn) {
    excelBtn.addEventListener("click", () => {
      if (selectedEventId) {
        handleAction("excel", selectedEventId);
      }
    });
  }
  
  if (toggleEditModeBtn) {
    toggleEditModeBtn.addEventListener("click", () => {
      setEditMode(!isEditMode);
    });
  }
  
  if (saveEventBtn) {
    saveEventBtn.addEventListener("click", handleSaveEvent);
  }
  
  if (closeViewEditEventModal) {
    closeViewEditEventModal.addEventListener("click", closeViewEditEventModalFunc);
  }
  
  if (cancelViewEditEventBtn) {
    cancelViewEditEventBtn.addEventListener("click", closeViewEditEventModalFunc);
  }

  if (markArrivalModalBtn) {
    markArrivalModalBtn.addEventListener("click", () => {
      if (selectedEventId) {
        openMarkArrivalModal();
      }
    });
  }

  if (attendanceBtn) {
    attendanceBtn.addEventListener("click", () => {
      if (selectedEventId) {
        openRegisterAttendanceModal();
      }
    });
  }

  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      if (selectedEventId) {
        handleAction("acta", selectedEventId);
      }
    });
  }

  // Event listeners para modales
  if (closeMarkArrivalModal) {
    closeMarkArrivalModal.addEventListener("click", closeMarkArrivalModalFunc);
  }

  if (cancelMarkArrivalBtn) {
    cancelMarkArrivalBtn.addEventListener("click", closeMarkArrivalModalFunc);
  }

  if (markArrivalModal) {
    markArrivalModal.addEventListener("click", (e) => {
      if (e.target === markArrivalModal) {
        closeMarkArrivalModalFunc();
      }
    });
  }

  if (selectAttendeeModal) {
    selectAttendeeModal.addEventListener("change", (e) => {
      if (markArrivalBtn) {
        markArrivalBtn.disabled = !e.target.value;
      }
    });
  }

  if (markArrivalBtn) {
    markArrivalBtn.addEventListener("click", handleMarkArrival);
  }

  if (closeRegisterAttendanceModal) {
    closeRegisterAttendanceModal.addEventListener("click", closeRegisterAttendanceModalFunc);
  }

  if (cancelRegisterAttendanceBtn) {
    cancelRegisterAttendanceBtn.addEventListener("click", closeRegisterAttendanceModalFunc);
  }

  if (registerAttendanceModal) {
    registerAttendanceModal.addEventListener("click", (e) => {
      if (e.target === registerAttendanceModal) {
        closeRegisterAttendanceModalFunc();
      }
    });
  }

  if (submitAttendanceModalBtn) {
    submitAttendanceModalBtn.addEventListener("click", handleRegisterAttendance);
  }

  // Cerrar modales con ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (markArrivalModal && !markArrivalModal.hidden) {
        closeMarkArrivalModalFunc();
      }
      if (registerAttendanceModal && !registerAttendanceModal.hidden) {
        closeRegisterAttendanceModalFunc();
      }
    }
  });

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
        case "create-event":
          window.location.href = "../evento/index.html";
          break;
        case "logout":
          Auth.logout();
          break;
      }
      mainMenu.hidden = true;
    });
  }

  // Inicializar canvas de firma cuando se abre el modal
  const initSignaturePadArrival = () => {
    const signatureCanvasArrival = document.getElementById("signatureCanvasArrival");
    if (!signatureCanvasArrival) return;

    signatureCtxArrival = signatureCanvasArrival.getContext("2d");
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    signatureCanvasArrival.width = 300 * ratio;
    signatureCanvasArrival.height = 400 * ratio;
    signatureCtxArrival.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtxArrival.scale(ratio, ratio);
    signatureCtxArrival.lineCap = "round";
    signatureCtxArrival.lineJoin = "round";
    signatureCtxArrival.lineWidth = 2;
    signatureCtxArrival.strokeStyle = "#4d6aff";

    const getPoint = (e) => {
      const rect = signatureCanvasArrival.getBoundingClientRect();
      return {
        x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
        y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top,
      };
    };

    signatureCanvasArrival.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const point = getPoint(e);
      signatureCtxArrival.beginPath();
      signatureCtxArrival.moveTo(point.x, point.y);
      isSignatureDrawingArrival = true;
      signatureIsDirtyArrival = true;
    });

    signatureCanvasArrival.addEventListener("pointermove", (e) => {
      if (!isSignatureDrawingArrival) return;
      e.preventDefault();
      const point = getPoint(e);
      signatureCtxArrival.lineTo(point.x, point.y);
      signatureCtxArrival.stroke();
    });

    signatureCanvasArrival.addEventListener("pointerup", () => {
      isSignatureDrawingArrival = false;
    });

    signatureCanvasArrival.addEventListener("pointerleave", () => {
      isSignatureDrawingArrival = false;
    });

    const signatureClearBtnArrival = document.getElementById("signatureClearBtnArrival");
    if (signatureClearBtnArrival) {
      signatureClearBtnArrival.addEventListener("click", () => {
        signatureCtxArrival.clearRect(0, 0, signatureCanvasArrival.width, signatureCanvasArrival.height);
        signatureIsDirtyArrival = false;
      });
    }
  };


  const boot = async () => {
    await fetchClientName();
    await loadEvents();
    await loadAssistances();
    renderStats();
    renderEvents();
  };

  boot();
});

