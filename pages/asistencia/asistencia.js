document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.protect([1, 2]);
  if (!session) return;

  Auth.bindLogout();

  const eventSelect = document.getElementById("attendanceEvent");
  const attendanceForm = document.getElementById("attendanceForm");
  const attendanceTableBody = document.getElementById("attendanceTableBody");
  const attendanceSearch = document.getElementById("attendanceSearch");
  const eventTimer = document.getElementById("eventTimer");
  const exportButton = document.getElementById("exportAttendance");
  const signatureCanvas = document.getElementById("signatureCanvas");
  const signatureClearBtn = document.getElementById("signatureClearBtn");

  const isUser = session.role_id === 2;
  let pendingEventId = sessionStorage.getItem("eventia:attendanceEventId");

  let selectedEventId = null;
  let cachedAssistances = [];
  let cachedEvents = [];
  let cachedClients = [];
  let clientId = null;
  let timerInterval = null;
  let signatureCtx = null;
  let isSignatureDrawing = false;
  let signatureIsDirty = false;

  const toArray = (payload, fallbackKey) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (fallbackKey && Array.isArray(payload[fallbackKey])) return payload[fallbackKey];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.result)) return payload.result;
    return [];
  };

  const showAlert = (message) => {
    alert(message);
  };

  const clearSignature = () => {
    if (!signatureCanvas || !signatureCtx) return;
    signatureCtx.save();
    signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    signatureCtx.restore();
    signatureIsDirty = false;
  };

  const updateSignatureCanvasSize = () => {
    if (!signatureCanvas) return;
    if (!signatureCtx) {
      signatureCtx = signatureCanvas.getContext("2d");
    }
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCanvas.width = rect.width * ratio;
    signatureCanvas.height = rect.height * ratio;
    signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtx.scale(ratio, ratio);
    signatureCtx.lineCap = "round";
    signatureCtx.lineJoin = "round";
    signatureCtx.lineWidth = 2;
    signatureCtx.strokeStyle = "#4d6aff";
    clearSignature();
  };

  const getSignaturePoint = (event) => {
    const rect = signatureCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleSignaturePointerDown = (event) => {
    if (!signatureCanvas || !signatureCtx) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try {
      signatureCanvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // El navegador puede no soportar pointer capture.
    }
    const point = getSignaturePoint(event);
    signatureCtx.beginPath();
    signatureCtx.moveTo(point.x, point.y);
    isSignatureDrawing = true;
  };

  const handleSignaturePointerMove = (event) => {
    if (!isSignatureDrawing || !signatureCtx) return;
    event.preventDefault();
    const point = getSignaturePoint(event);
    signatureCtx.lineTo(point.x, point.y);
    signatureCtx.stroke();
    signatureIsDirty = true;
  };

  const stopSignatureDrawing = (event) => {
    if (!isSignatureDrawing || !signatureCtx) return;
    event.preventDefault();
    signatureCtx.closePath();
    isSignatureDrawing = false;
    if (signatureCanvas && typeof signatureCanvas.releasePointerCapture === "function") {
      try {
        signatureCanvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignorar si no había captura activa.
      }
    }
  };

  const getSignatureBlob = () =>
    new Promise((resolve) => {
      if (!signatureCanvas) {
        resolve(null);
        return;
      }
      if (typeof signatureCanvas.toBlob === "function") {
        signatureCanvas.toBlob(
          (blob) => resolve(blob),
          "image/png"
        );
      } else {
        try {
          const dataUrl = signatureCanvas.toDataURL("image/png");
          fetch(dataUrl)
            .then((response) => response.blob())
            .then(resolve)
            .catch(() => resolve(null));
        } catch (error) {
          resolve(null);
        }
      }
    });

  const blobToBase64 = (blob) =>
    new Promise((resolve) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        // Remover el prefijo data:image/png;base64, si existe
        const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
        resolve(base64Data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

  const initSignaturePad = () => {
    if (!signatureCanvas) return;
    signatureCtx = signatureCanvas.getContext("2d");
    updateSignatureCanvasSize();
    signatureCanvas.addEventListener("pointerdown", handleSignaturePointerDown);
    signatureCanvas.addEventListener("pointermove", handleSignaturePointerMove);
    signatureCanvas.addEventListener("pointerup", stopSignatureDrawing);
    signatureCanvas.addEventListener("pointerleave", stopSignatureDrawing);
    signatureCanvas.addEventListener("pointercancel", stopSignatureDrawing);
    window.addEventListener("resize", updateSignatureCanvasSize);
    if (signatureClearBtn) {
      signatureClearBtn.addEventListener("click", (event) => {
        event.preventDefault();
        clearSignature();
      });
    }
  };

  const setSignatureEnabled = (enabled) => {
    if (!signatureCanvas) return;
    signatureCanvas.style.pointerEvents = enabled ? "auto" : "none";
    if (!enabled) {
      clearSignature();
    }
    if (signatureClearBtn) {
      signatureClearBtn.disabled = !enabled;
    }
  };

  const resolveClientId = async () => {
    if (clientId) return clientId;
    try {
      const response = await API.getClientes();
      cachedClients = toArray(response, "clientes");
      if (!cachedClients.length) return null;
      if (session.role_id === 2) {
        const matchByUser = cachedClients.find((client) => Number(client.user_id) === Number(session.id));
        clientId = matchByUser ? matchByUser.id : cachedClients[0].id;
      } else {
        clientId = cachedClients[0].id;
      }
      return clientId;
    } catch (error) {
      console.error("Error al cargar clientes", error);
      showAlert(error.message || "No fue posible obtener los clientes.");
      return null;
    }
  };

  const mapEvent = (event) => ({
    id: event.id,
    nombre: event.nombre,
    fecha: event.fecha,
    hora_inicio: event.hora_inicio,
    hora_fin: event.hora_fin,
  });

  const mapAssistance = (assistance) => ({
    id: assistance.id,
    evento_id: assistance.evento_id,
    numero_identificacion: assistance.numero_identificacion,
    nombres: assistance.nombres,
    apellidos: assistance.apellidos,
    correo_electronico: assistance.correo_electronico,
    numero_celular: assistance.numero_celular,
    cargo: assistance.cargo,
    empresa: assistance.empresa,
    invitado: Number(assistance.invitado) === 1,
    asiste: Number(assistance.asiste) === 1,
    created_at: assistance.created_at,
  });

  const loadEvents = async () => {
    const currentClientId = await resolveClientId();
    if (!currentClientId) {
      eventSelect.innerHTML = `<option value="">Sin eventos disponibles</option>`;
      eventSelect.disabled = true;
      attendanceForm.querySelectorAll("input, button, select").forEach((el) => (el.disabled = true));
      setSignatureEnabled(false);
      return;
    }

    try {
      const response = await API.listarEventos(currentClientId);
      cachedEvents = toArray(response, "eventos").map(mapEvent);
      if (!cachedEvents.length) {
        eventSelect.innerHTML = `<option value="">Sin eventos disponibles</option>`;
        eventSelect.disabled = true;
        attendanceForm.querySelectorAll("input, button, select").forEach((el) => (el.disabled = true));
        setSignatureEnabled(false);
        return;
      }

      eventSelect.innerHTML = cachedEvents
        .map(
          (event) =>
            `<option value="${event.id}">${event.nombre} • ${event.fecha}</option>`
        )
        .join("");
      eventSelect.disabled = false;
      attendanceForm.querySelectorAll("input, button, select").forEach((el) => el.removeAttribute("disabled"));
      setSignatureEnabled(isUser);

      const storedEvent = pendingEventId
        ? cachedEvents.find(
            (event) => String(event.id) === String(pendingEventId)
          )
        : null;

      selectedEventId = storedEvent ? storedEvent.id : cachedEvents[0].id;
      eventSelect.value = selectedEventId;
      if (pendingEventId) {
        sessionStorage.removeItem("eventia:attendanceEventId");
        pendingEventId = null;
      }

      await loadAssistances();
      startTimer();
    } catch (error) {
      console.error("Error al cargar eventos", error);
      showAlert(error.message || "No fue posible obtener los eventos.");
    }
  };

  const loadAssistances = async (searchTerm = "") => {
    if (!selectedEventId) return;

    try {
      if (searchTerm && searchTerm.trim().length >= 3) {
        const response = await API.buscarAsistencia(selectedEventId, searchTerm.trim());
        cachedAssistances = toArray(response, "asistencias").map(mapAssistance);
      } else {
        const response = await API.listarAsistencia(selectedEventId);
        cachedAssistances = toArray(response, "asistencias").map(mapAssistance);
      }
    } catch (error) {
      console.error("Error al cargar asistencias", error);
      showAlert(error.message || "No fue posible obtener las asistencias.");
      cachedAssistances = [];
    }

    renderAssistances(searchTerm);
  };

  const renderAssistances = (filter = "") => {
    const normalized = filter.trim().toLowerCase();
    const data = normalized
      ? cachedAssistances.filter((item) => {
          const fullName = `${item.nombres || ""} ${item.apellidos || ""}`.toLowerCase();
          return (
            String(item.numero_identificacion || "").toLowerCase().includes(normalized) ||
            fullName.includes(normalized) ||
            String(item.correo_electronico || "").toLowerCase().includes(normalized)
          );
        })
      : cachedAssistances;

    if (!data.length) {
      attendanceTableBody.innerHTML = `<tr><td colspan="7">No hay registros de asistencia.</td></tr>`;
      return;
    }

    attendanceTableBody.innerHTML = data
      .map((assist) => {
        const createdAt = assist.created_at ? new Date(assist.created_at).toLocaleString() : "—";
        const statusClass = assist.asiste ? "status-success" : "status-danger";
        const statusText = assist.asiste ? "Asistió" : "Pendiente";
        const canToggle = isUser;
        return `
          <tr>
            <td>${assist.numero_identificacion}</td>
            <td>${assist.nombres} ${assist.apellidos}</td>
            <td>${assist.correo_electronico}</td>
            <td><span class="tag ${statusClass}">${statusText}</span></td>
            <td>${assist.empresa}</td>
            <td>${createdAt}</td>
            <td class="assist-actions">
              ${
                canToggle
                  ? `<button class="btn btn-small ${assist.asiste ? "btn-outline" : "btn-primary"}" data-toggle-assist="${
                      assist.id
                    }" data-current="${assist.asiste ? "1" : "0"}">
                      ${assist.asiste ? "Marcar como pendiente" : "Marcar asistencia"}
                    </button>`
                  : "—"
              }
            </td>
          </tr>
        `;
      })
      .join("");
  };

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

  const resolveEventDate = (event) => {
    if (!event?.fecha) return null;
    const datePart = event.fecha.split("T")[0];
    const time = normalizeTime(event.hora_inicio);
    const candidate = new Date(`${datePart}T${time}`);
    if (!Number.isNaN(candidate.valueOf())) {
      return candidate;
    }
    const fallback = new Date(event.fecha);
    return Number.isNaN(fallback.valueOf()) ? null : fallback;
  };

  const startTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    if (!eventTimer) return;
    if (!selectedEventId) {
      eventTimer.textContent = "—";
      return;
    }

    const selectedEvent = cachedEvents.find((event) => Number(event.id) === Number(selectedEventId));
    if (!selectedEvent) {
      eventTimer.textContent = "—";
      return;
    }

    const eventDate = resolveEventDate(selectedEvent);
    if (!eventDate) {
      eventTimer.textContent = "Fecha u hora no disponible";
      return;
    }

    const updateTimer = () => {
      const diff = eventDate - new Date();
      if (!Number.isFinite(diff)) {
        eventTimer.textContent = "Fecha u hora no disponible";
        if (timerInterval) clearInterval(timerInterval);
        return;
      }
      if (diff <= 0) {
        eventTimer.textContent = "Evento en curso o finalizado";
        clearInterval(timerInterval);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      eventTimer.textContent = `${days}d ${hours}h ${minutes}m`;
    };

    updateTimer();
    timerInterval = setInterval(updateTimer, 60000);
  };

  const extractAttendanceForm = () => ({
    numero_identificacion: document.getElementById("attendeeDocument").value.trim(),
    nombres: document.getElementById("attendeeFirstName").value.trim(),
    apellidos: document.getElementById("attendeeLastName").value.trim(),
    correo_electronico: document.getElementById("attendeeEmail").value.trim(),
    numero_celular: document.getElementById("attendeePhone").value.trim(),
    cargo: document.getElementById("attendeeRole").value.trim(),
    empresa: document.getElementById("attendeeCompany").value.trim(),
    invitado: document.getElementById("attendeeGuest").value,
  });

  const handleFormSubmit = async (event) => {
    event.preventDefault();
    if (!selectedEventId) return;
    if (!isUser) {
      showAlert("Solo los usuarios pueden registrar asistencias.");
      return;
    }

    const formValues = extractAttendanceForm();
    const requiredFields = [
      "numero_identificacion",
      "nombres",
      "apellidos",
      "correo_electronico",
      "numero_celular",
      "cargo",
      "empresa",
    ];

    const missing = requiredFields.filter((field) => !formValues[field]);
    if (missing.length) {
      showAlert("Completa todos los campos obligatorios.");
      return;
    }

    const signatureBlob =
      signatureCanvas && signatureIsDirty ? await getSignatureBlob() : null;
    const isGuest = formValues.invitado === "1";

    const formData = new FormData();
    formData.append("evento_id", selectedEventId);
    formData.append("user_id", session.id);
    formData.append("numero_identificacion", formValues.numero_identificacion);
    formData.append("nombres", formValues.nombres);
    formData.append("apellidos", formValues.apellidos);
    formData.append("correo_electronico", formValues.correo_electronico);
    formData.append("numero_celular", formValues.numero_celular);
    formData.append("cargo", formValues.cargo);
    formData.append("empresa", formValues.empresa);
    formData.append("invitado", formValues.invitado);
    
    // Si es invitado, no marcamos como asistente inicialmente, se hará con marcarLlegada
    if (!isGuest) {
      formData.append("asiste", "1");
    }
    formData.append("estado_id", "1");
    
    // Si no es invitado, agregamos la firma al FormData
    if (signatureBlob && !isGuest) {
      formData.append("firma", signatureBlob, `firma_${Date.now()}.png`);
    }

    try {
      // Registrar la asistencia primero
      const response = await API.registrarAsistencia(selectedEventId, formData);
      
      // Si es invitado, usar marcarLlegada para registrar la llegada
      if (isGuest) {
        let asistenciaId = response?.id || response?.data?.id || response?.asistencia_id;
        
        // Si no obtenemos el ID de la respuesta, buscar en la lista recién actualizada
        if (!asistenciaId) {
          await loadAssistances(attendanceSearch.value);
          // Buscar la asistencia recién creada por número de identificación y correo
          const nuevaAsistencia = cachedAssistances.find(
            (a) => 
              a.numero_identificacion === formValues.numero_identificacion &&
              a.correo_electronico === formValues.correo_electronico
          );
          if (nuevaAsistencia) {
            asistenciaId = nuevaAsistencia.id;
          }
        }
        
        if (asistenciaId) {
          const firmaBase64 = signatureBlob ? await blobToBase64(signatureBlob) : null;
          await API.marcarLlegada(selectedEventId, asistenciaId, {
            firma: firmaBase64,
          });
        } else {
          console.warn("No se pudo obtener el ID de asistencia para marcar llegada");
        }
      }
      
      attendanceForm.reset();
      clearSignature();
      await loadAssistances(attendanceSearch.value);
    } catch (error) {
      console.error("Error al registrar asistencia", error);
      showAlert(error.message || "No fue posible registrar la asistencia.");
    }
  };

  const downloadCsv = () => {
    if (!cachedAssistances.length) {
      showAlert("No hay datos para exportar.");
      return;
    }
    const header = [
      "Número identificación",
      "Nombres",
      "Apellidos",
      "Correo",
      "Teléfono",
      "Cargo",
      "Empresa",
      "Invitado",
      "Asiste",
      "Registrado",
    ];
    const rows = cachedAssistances.map((assist) => [
      assist.numero_identificacion,
      assist.nombres,
      assist.apellidos,
      assist.correo_electronico,
      assist.numero_celular,
      assist.cargo,
      assist.empresa,
      assist.invitado ? "Sí" : "No",
      assist.asiste ? "Sí" : "No",
      assist.created_at ? new Date(assist.created_at).toLocaleString() : "",
    ]);

    const csvContent = [header, ...rows]
      .map((cols) => cols.map((col) => `"${String(col ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `asistencias_evento_${selectedEventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  initSignaturePad();

  eventSelect.addEventListener("change", async (event) => {
    selectedEventId = event.target.value;
    sessionStorage.removeItem("eventia:attendanceEventId");
    await loadAssistances(attendanceSearch.value);
    startTimer();
  });

  attendanceForm.addEventListener("submit", handleFormSubmit);
  if (isUser && attendanceTableBody) {
    attendanceTableBody.addEventListener("click", async (event) => {
      const toggleBtn = event.target.closest("[data-toggle-assist]");
      if (!toggleBtn) return;
      const asistenciaId = Number(toggleBtn.dataset.toggleAssist);
      const current = toggleBtn.dataset.current === "1";
      if (!selectedEventId || !asistenciaId) return;
      toggleBtn.disabled = true;
      toggleBtn.textContent = current ? "Actualizando..." : "Registrando...";
      try {
        if (current) {
          // Si ya asistió, usar actualizarEstadoAsistencia para marcarlo como pendiente
          await API.actualizarEstadoAsistencia(selectedEventId, asistenciaId, false);
        } else {
          // Si está pendiente, usar marcarLlegada para registrar la llegada
          await API.marcarLlegada(selectedEventId, asistenciaId);
        }
        await loadAssistances(attendanceSearch.value);
      } catch (error) {
        console.error("Error al actualizar asistencia", error);
        showAlert(error.message || "No fue posible actualizar la asistencia.");
      } finally {
        toggleBtn.disabled = false;
      }
    });
  }
  attendanceSearch.addEventListener("input", async (event) => {
    const value = event.target.value;
    if (value.trim().length >= 3 || !value.trim()) {
      await loadAssistances(value);
    } else {
      renderAssistances(value);
    }
  });

  exportButton.addEventListener("click", (event) => {
    event.preventDefault();
    downloadCsv();
  });

  if (!isUser) {
    attendanceForm.querySelectorAll("input, button, select").forEach((el) => {
      if (el.type !== "button") {
        el.setAttribute("disabled", "true");
      }
    });
    setSignatureEnabled(false);
  }

  loadEvents();
});
