document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.protect([1, 2]);
  if (!session) return;

  const menuToggle = document.getElementById("menuToggle");
  const mainMenu = document.getElementById("mainMenu");
  const eventName = document.getElementById("eventName");
  const attendanceForm = document.getElementById("attendanceForm");
  const attendanceTableBody = document.getElementById("attendanceTableBody");
  const attendanceSearch = document.getElementById("attendanceSearch");
  const exportButton = document.getElementById("exportAttendance");
  const signatureCanvas = document.getElementById("signatureCanvas");
  const signatureClearBtn = document.getElementById("signatureClearBtn");
  const submitBtn = document.getElementById("submitBtn");
  const loadingOverlay = document.getElementById("loadingOverlay");
  
  // Elementos para "Marcar llegada" (modal)
  const markArrivalModalBtn = document.getElementById("markArrivalModalBtn");
  const markArrivalModal = document.getElementById("markArrivalModal");
  const closeMarkArrivalModal = document.getElementById("closeMarkArrivalModal");
  const cancelMarkArrivalBtn = document.getElementById("cancelMarkArrivalBtn");
  const selectAttendeeModal = document.getElementById("selectAttendeeModal");
  const signatureCanvasArrival = document.getElementById("signatureCanvasArrival");
  const signatureClearBtnArrival = document.getElementById("signatureClearBtnArrival");
  const markArrivalBtn = document.getElementById("markArrivalBtn");
  const loadingOverlayArrival = document.getElementById("loadingOverlayArrival");

  const isAdmin = session.role_id === 1;
  const isUser = session.role_id === 2;
  const canRegisterAttendance = isAdmin || isUser;
  let pendingEventId = sessionStorage.getItem("eventia:attendanceEventId");

  let selectedEventId = null;
  let cachedAssistances = [];
  let cachedEvents = [];
  let cachedClients = [];
  let clientId = null;
  let signatureCtx = null;
  let isSignatureDrawing = false;
  let signatureIsDirty = false;
  
  // Variables para el canvas de "Marcar llegada"
  let signatureCtxArrival = null;
  let isSignatureDrawingArrival = false;
  let signatureIsDirtyArrival = false;

  const toArray = (payload, fallbackKey) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (fallbackKey && Array.isArray(payload[fallbackKey]))
      return payload[fallbackKey];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.result)) return payload.result;
    return [];
  };

  let loadingTimeout = null;

  const showLoading = (show = true) => {
    if (loadingOverlay) {
      loadingOverlay.hidden = !show;
    }
    if (submitBtn) {
      submitBtn.disabled = show;
    }

    // Limpiar timeout anterior si existe
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }

    // Timeout de seguridad: ocultar después de 30 segundos máximo
    if (show) {
      loadingTimeout = setTimeout(() => {
        console.warn("Timeout de seguridad: ocultando overlay de carga");
        showLoading(false);
      }, 30000);
    }
  };

  const clearSignature = () => {
    if (!signatureCanvas || !signatureCtx) return;
    signatureCtx.save();
    signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    signatureCtx.restore();
    signatureIsDirty = false;
  };

  const isMobile = () => {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768
    );
  };

  const updateSignatureCanvasSize = () => {
    if (!signatureCanvas) return;
    if (!signatureCtx) {
      signatureCtx = signatureCanvas.getContext("2d");
    }
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = signatureCanvas.getBoundingClientRect();
    // Tamaño fijo 300x400
    const targetWidth = 300;
    const targetHeight = 400;
    signatureCanvas.width = targetWidth * ratio;
    signatureCanvas.height = targetHeight * ratio;
    signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtx.scale(ratio, ratio);
    signatureCtx.lineCap = "round";
    signatureCtx.lineJoin = "round";
    signatureCtx.lineWidth = isMobile() ? 4 : 2;
    signatureCtx.strokeStyle = "#4d6aff";
    clearSignature();
  };

  const getSignaturePoint = (event) => {
    const rect = signatureCanvas.getBoundingClientRect();
    const clientX = event.touches
      ? event.touches[0].clientX
      : event.clientX || event.pageX;
    const clientY = event.touches
      ? event.touches[0].clientY
      : event.clientY || event.pageY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleSignatureStart = (event) => {
    if (!signatureCanvas || !signatureCtx) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      if (event.pointerId !== undefined) {
        signatureCanvas.setPointerCapture(event.pointerId);
      }
    } catch (error) {
      // El navegador puede no soportar pointer capture.
    }
    const point = getSignaturePoint(event);
    signatureCtx.fillStyle = signatureCtx.strokeStyle;
    signatureCtx.beginPath();
    signatureCtx.moveTo(point.x, point.y);
    signatureCtx.arc(point.x, point.y, isMobile() ? 2 : 1, 0, 2 * Math.PI);
    signatureCtx.fill();
    signatureCtx.beginPath();
    signatureCtx.moveTo(point.x, point.y);
    isSignatureDrawing = true;
    signatureIsDirty = true;
  };

  const handleSignatureMove = (event) => {
    if (!isSignatureDrawing || !signatureCtx) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getSignaturePoint(event);
    signatureCtx.lineTo(point.x, point.y);
    signatureCtx.stroke();
    signatureIsDirty = true;
  };

  const handleSignatureEnd = (event) => {
    if (!isSignatureDrawing || !signatureCtx) return;
    event.preventDefault();
    event.stopPropagation();
    signatureCtx.closePath();
    isSignatureDrawing = false;
    if (
      signatureCanvas &&
      event.pointerId !== undefined &&
      typeof signatureCanvas.releasePointerCapture === "function"
    ) {
      try {
        signatureCanvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignorar si no había captura activa.
      }
    }
  };

  const getSignatureBlob = () => {
    if (!signatureCanvas) {
      return Promise.resolve(null);
    }
    return optimizeSignature(signatureCanvas);
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

  const initSignaturePad = () => {
    if (!signatureCanvas) return;
    signatureCtx = signatureCanvas.getContext("2d");
    updateSignatureCanvasSize();

    const signatureHint = document.getElementById("signatureHint");
    if (signatureHint && isMobile()) {
      signatureHint.textContent =
        "Toca y arrastra en el recuadro para firmar. Usa el dedo o un stylus.";
    }

    const preventDefault = (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    signatureCanvas.addEventListener("touchstart", preventDefault, {
      passive: false,
    });

    signatureCanvas.addEventListener("pointerdown", handleSignatureStart);
    signatureCanvas.addEventListener("pointermove", handleSignatureMove);
    signatureCanvas.addEventListener("pointerup", handleSignatureEnd);
    signatureCanvas.addEventListener("pointerleave", handleSignatureEnd);
    signatureCanvas.addEventListener("pointercancel", handleSignatureEnd);

    signatureCanvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          const touch = e.touches[0];
          const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pageX: touch.pageX,
            pageY: touch.pageY,
            touches: e.touches,
            pointerType: "touch",
            button: 0,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
          };
          handleSignatureStart(fakeEvent);
        }
      },
      { passive: false }
    );

    signatureCanvas.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          const touch = e.touches[0];
          const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pageX: touch.pageX,
            pageY: touch.pageY,
            touches: e.touches,
            pointerType: "touch",
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
          };
          handleSignatureMove(fakeEvent);
        }
      },
      { passive: false }
    );

    signatureCanvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const fakeEvent = {
          pointerType: "touch",
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
        };
        handleSignatureEnd(fakeEvent);
      },
      { passive: false }
    );

    signatureCanvas.addEventListener(
      "touchcancel",
      (e) => {
        e.preventDefault();
        const fakeEvent = {
          pointerType: "touch",
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
        };
        handleSignatureEnd(fakeEvent);
      },
      { passive: false }
    );

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

  // Funciones para el canvas de "Marcar llegada"
  const clearSignatureArrival = () => {
    if (!signatureCanvasArrival || !signatureCtxArrival) return;
    signatureCtxArrival.save();
    signatureCtxArrival.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtxArrival.clearRect(0, 0, signatureCanvasArrival.width, signatureCanvasArrival.height);
    signatureCtxArrival.restore();
    signatureIsDirtyArrival = false;
  };

  const updateSignatureCanvasSizeArrival = () => {
    if (!signatureCanvasArrival) return;
    if (!signatureCtxArrival) {
      signatureCtxArrival = signatureCanvasArrival.getContext("2d");
    }
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = signatureCanvasArrival.getBoundingClientRect();
    const targetWidth = 300;
    const targetHeight = 400;
    signatureCanvasArrival.width = targetWidth * ratio;
    signatureCanvasArrival.height = targetHeight * ratio;
    signatureCtxArrival.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtxArrival.scale(ratio, ratio);
    signatureCtxArrival.lineCap = "round";
    signatureCtxArrival.lineJoin = "round";
    signatureCtxArrival.lineWidth = isMobile() ? 4 : 2;
    signatureCtxArrival.strokeStyle = "#4d6aff";
    clearSignatureArrival();
  };

  const getSignaturePointArrival = (event) => {
    const rect = signatureCanvasArrival.getBoundingClientRect();
    const clientX = event.touches
      ? event.touches[0].clientX
      : event.clientX || event.pageX;
    const clientY = event.touches
      ? event.touches[0].clientY
      : event.clientY || event.pageY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleSignatureStartArrival = (event) => {
    if (!signatureCanvasArrival || !signatureCtxArrival) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      if (event.pointerId !== undefined) {
        signatureCanvasArrival.setPointerCapture(event.pointerId);
      }
    } catch (error) {}
    const point = getSignaturePointArrival(event);
    signatureCtxArrival.fillStyle = signatureCtxArrival.strokeStyle;
    signatureCtxArrival.beginPath();
    signatureCtxArrival.moveTo(point.x, point.y);
    signatureCtxArrival.arc(point.x, point.y, isMobile() ? 2 : 1, 0, 2 * Math.PI);
    signatureCtxArrival.fill();
    signatureCtxArrival.beginPath();
    signatureCtxArrival.moveTo(point.x, point.y);
    isSignatureDrawingArrival = true;
    signatureIsDirtyArrival = true;
  };

  const handleSignatureMoveArrival = (event) => {
    if (!isSignatureDrawingArrival || !signatureCtxArrival) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getSignaturePointArrival(event);
    signatureCtxArrival.lineTo(point.x, point.y);
    signatureCtxArrival.stroke();
    signatureIsDirtyArrival = true;
  };

  const handleSignatureEndArrival = (event) => {
    if (!isSignatureDrawingArrival || !signatureCtxArrival) return;
    event.preventDefault();
    event.stopPropagation();
    signatureCtxArrival.closePath();
    isSignatureDrawingArrival = false;
    if (
      signatureCanvasArrival &&
      event.pointerId !== undefined &&
      typeof signatureCanvasArrival.releasePointerCapture === "function"
    ) {
      try {
        signatureCanvasArrival.releasePointerCapture(event.pointerId);
      } catch (error) {}
    }
  };

  // Función para optimizar y comprimir la firma
  const optimizeSignature = (canvas) => {
    return new Promise((resolve) => {
      if (!canvas) {
        resolve(null);
        return;
      }

      try {
        // Tamaño muy pequeño para asegurar que quepa en la BD
        const targetWidth = 80;
        const targetHeight = 40;
        const quality = 0.15;
        
        // Crear un canvas temporal más pequeño
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        
        // Dibujar la imagen redimensionada
        tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
        
        // Convertir a JPEG con calidad muy reducida
        if (typeof tempCanvas.toBlob === "function") {
          tempCanvas.toBlob((blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            // Verificar tamaño del base64 antes de enviar
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result;
              const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
              console.log(`Firma optimizada: tamaño blob = ${blob.size} bytes, base64 = ${base64Data.length} caracteres`);
              
              // Si aún es muy grande, reducir más
              if (base64Data.length > 2000) {
                console.warn(`Firma aún muy grande (${base64Data.length}), reduciendo más...`);
                // Reducir a 60x30 con calidad 0.1
                const smallerCanvas = document.createElement("canvas");
                const smallerCtx = smallerCanvas.getContext("2d");
                smallerCanvas.width = 60;
                smallerCanvas.height = 30;
                smallerCtx.drawImage(canvas, 0, 0, 60, 30);
                smallerCanvas.toBlob((smallBlob) => {
                  if (smallBlob) {
                    const smallReader = new FileReader();
                    smallReader.onloadend = () => {
                      const smallBase64 = smallReader.result;
                      const smallBase64Data = smallBase64.includes(",") ? smallBase64.split(",")[1] : smallBase64;
                      console.log(`Firma reducida: tamaño blob = ${smallBlob.size} bytes, base64 = ${smallBase64Data.length} caracteres`);
                      fetch(smallBase64)
                        .then((response) => response.blob())
                        .then(resolve)
                        .catch(() => resolve(null));
                    };
                    smallReader.readAsDataURL(smallBlob);
                  } else {
                    resolve(blob);
                  }
                }, "image/jpeg", 0.1);
              } else {
                resolve(blob);
              }
            };
            reader.readAsDataURL(blob);
          }, "image/jpeg", quality);
        } else {
          try {
            const dataUrl = tempCanvas.toDataURL("image/jpeg", quality);
            const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
            console.log(`Firma optimizada: tamaño base64 = ${base64Data.length} caracteres`);
            
            if (base64Data.length > 2000) {
              // Reducir más
              const smallerCanvas = document.createElement("canvas");
              const smallerCtx = smallerCanvas.getContext("2d");
              smallerCanvas.width = 60;
              smallerCanvas.height = 30;
              smallerCtx.drawImage(canvas, 0, 0, 60, 30);
              const smallerDataUrl = smallerCanvas.toDataURL("image/jpeg", 0.1);
              const smallerBase64Data = smallerDataUrl.includes(",") ? smallerDataUrl.split(",")[1] : smallerDataUrl;
              console.log(`Firma reducida: tamaño base64 = ${smallerBase64Data.length} caracteres`);
              fetch(smallerDataUrl)
                .then((response) => response.blob())
                .then(resolve)
                .catch(() => resolve(null));
            } else {
              fetch(dataUrl)
                .then((response) => response.blob())
                .then(resolve)
                .catch(() => resolve(null));
            }
          } catch (error) {
            console.error("Error al optimizar firma:", error);
            resolve(null);
          }
        }
      } catch (error) {
        console.error("Error al optimizar firma:", error);
        resolve(null);
      }
    });
  };

  const getSignatureBlobArrival = () => {
    if (!signatureCanvasArrival) {
      return Promise.resolve(null);
    }
    return optimizeSignature(signatureCanvasArrival);
  };

  const initSignaturePadArrival = () => {
    if (!signatureCanvasArrival) return;
    signatureCtxArrival = signatureCanvasArrival.getContext("2d");
    updateSignatureCanvasSizeArrival();

    const preventDefault = (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    signatureCanvasArrival.addEventListener("touchstart", preventDefault, {
      passive: false,
    });

    signatureCanvasArrival.addEventListener("pointerdown", handleSignatureStartArrival);
    signatureCanvasArrival.addEventListener("pointermove", handleSignatureMoveArrival);
    signatureCanvasArrival.addEventListener("pointerup", handleSignatureEndArrival);
    signatureCanvasArrival.addEventListener("pointerleave", handleSignatureEndArrival);
    signatureCanvasArrival.addEventListener("pointercancel", handleSignatureEndArrival);

    signatureCanvasArrival.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          const touch = e.touches[0];
          const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pageX: touch.pageX,
            pageY: touch.pageY,
            touches: e.touches,
            pointerType: "touch",
            button: 0,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
          };
          handleSignatureStartArrival(fakeEvent);
        }
      },
      { passive: false }
    );

    signatureCanvasArrival.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          const touch = e.touches[0];
          const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pageX: touch.pageX,
            pageY: touch.pageY,
            touches: e.touches,
            pointerType: "touch",
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
          };
          handleSignatureMoveArrival(fakeEvent);
        }
      },
      { passive: false }
    );

    signatureCanvasArrival.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        const fakeEvent = {
          pointerType: "touch",
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
        };
        handleSignatureEndArrival(fakeEvent);
      },
      { passive: false }
    );

    signatureCanvasArrival.addEventListener(
      "touchcancel",
      (e) => {
        e.preventDefault();
        const fakeEvent = {
          pointerType: "touch",
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
        };
        handleSignatureEndArrival(fakeEvent);
      },
      { passive: false }
    );

    window.addEventListener("resize", updateSignatureCanvasSizeArrival);
    if (signatureClearBtnArrival) {
      signatureClearBtnArrival.addEventListener("click", (event) => {
        event.preventDefault();
        clearSignatureArrival();
      });
    }
  };

  const showLoadingArrival = (show = true) => {
    if (loadingOverlayArrival) {
      loadingOverlayArrival.hidden = !show;
    }
    if (markArrivalBtn) {
      markArrivalBtn.disabled = show;
      if (show) {
        markArrivalBtn.textContent = "Marcando...";
      } else {
        markArrivalBtn.textContent = "Marcar llegada";
      }
    }

    // Limpiar timeout anterior si existe
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }

    // Timeout de seguridad: ocultar después de 30 segundos máximo
    if (show) {
      loadingTimeout = setTimeout(() => {
        console.warn("Timeout de seguridad: ocultando overlay de carga (marcar llegada)");
        showLoadingArrival(false);
      }, 30000);
    }
  };

  const openMarkArrivalModal = () => {
    if (!markArrivalModal) return;
    markArrivalModal.hidden = false;
    // Poblar selector al abrir el modal
    updateAttendeeSelector();
  };

  const closeMarkArrivalModalFunc = () => {
    if (!markArrivalModal) return;
    markArrivalModal.hidden = true;
    clearSignatureArrival();
    if (selectAttendeeModal) selectAttendeeModal.value = "";
    if (markArrivalBtn) markArrivalBtn.disabled = true;
  };

  const updateAttendeeSelector = () => {
    if (!selectAttendeeModal) return;
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
  };

  const handleMarkArrival = async () => {
    if (!selectedEventId || !selectAttendeeModal || !selectAttendeeModal.value) return;

    const asistenciaId = Number(selectAttendeeModal.value);
    if (!asistenciaId) return;

    let signatureBase64 = null;
    if (signatureCanvasArrival && signatureIsDirtyArrival) {
      const signatureBlob = await getSignatureBlobArrival();
      if (signatureBlob) {
        signatureBase64 = await blobToBase64(signatureBlob);
      }
    }

    showLoadingArrival(true);
    try {
      await API.marcarLlegada(selectedEventId, asistenciaId, {
        firma: signatureBase64,
      });
      clearSignatureArrival();
      selectAttendeeModal.value = "";
      if (markArrivalBtn) markArrivalBtn.disabled = true;
      try {
        await loadAssistances(attendanceSearch.value);
      } catch (loadError) {
        console.error("Error al cargar asistencias", loadError);
      }
      closeMarkArrivalModalFunc();
    } catch (error) {
      console.error("Error al marcar llegada", error);
    } finally {
      showLoadingArrival(false);
    }
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
    firma: assistance.firma || null,
    created_at: assistance.created_at,
  });

  const loadEvents = async () => {
    // Siempre habilitar el formulario si el usuario tiene permisos
    if (attendanceForm && canRegisterAttendance) {
      attendanceForm
        .querySelectorAll("input, button, select")
        .forEach((el) => el.removeAttribute("disabled"));
    }
    setSignatureEnabled(canRegisterAttendance);
    
      // Habilitar botón "Marcar llegada" (modal)
      if (markArrivalModalBtn && canRegisterAttendance) {
        markArrivalModalBtn.removeAttribute("disabled");
      }
      if (signatureCanvasArrival && canRegisterAttendance) {
        signatureCanvasArrival.style.pointerEvents = "auto";
      }
      if (signatureClearBtnArrival && canRegisterAttendance) {
        signatureClearBtnArrival.removeAttribute("disabled");
      }

    const currentClientId = await resolveClientId();
    if (!currentClientId) {
      if (eventName) {
        eventName.textContent = "Sin eventos disponibles";
      }
      return;
    }

    try {
      const response = await API.listarEventos(currentClientId);
      cachedEvents = toArray(response, "eventos").map(mapEvent);
      if (!cachedEvents.length) {
        if (eventName) {
          eventName.textContent = "Sin eventos disponibles";
        }
        return;
      }

      const storedEvent = pendingEventId
        ? cachedEvents.find(
            (event) => String(event.id) === String(pendingEventId)
          )
        : null;

      selectedEventId = storedEvent ? storedEvent.id : cachedEvents[0].id;
      if (pendingEventId) {
        sessionStorage.removeItem("eventia:attendanceEventId");
        pendingEventId = null;
      }

      // Mostrar nombre del evento (solo lectura)
      if (eventName) {
        const selectedEvent = cachedEvents.find(
          (e) => Number(e.id) === Number(selectedEventId)
        );
        if (selectedEvent) {
          eventName.textContent = `${selectedEvent.nombre} • ${selectedEvent.fecha}`;
        }
      }

      // Habilitar botón "Marcar llegada" cuando hay eventos
      if (markArrivalModalBtn && canRegisterAttendance) {
        markArrivalModalBtn.removeAttribute("disabled");
      }

      await loadAssistances();
    } catch (error) {
      console.error("Error al cargar eventos", error);
      if (eventName) {
        eventName.textContent = "Error al cargar eventos";
      }
    }
  };

  const loadAssistances = async (searchTerm = "") => {
    if (!selectedEventId) return;

    try {
      if (searchTerm && searchTerm.trim().length >= 3) {
        const response = await API.buscarAsistencia(
          selectedEventId,
          searchTerm.trim()
        );
        cachedAssistances = toArray(response, "asistencias").map(mapAssistance);
      } else {
        const response = await API.listarAsistencia(selectedEventId);
        cachedAssistances = toArray(response, "asistencias").map(mapAssistance);
      }
    } catch (error) {
      console.error("Error al cargar asistencias", error);
      cachedAssistances = [];
    }

    renderAssistances(searchTerm);
  };

  const renderAssistances = (filter = "") => {
    const normalized = filter.trim().toLowerCase();
    const data = normalized
      ? cachedAssistances.filter((item) => {
          const searchableText = [
            item.numero_identificacion || "",
            item.nombres || "",
            item.apellidos || "",
            item.correo_electronico || "",
            item.numero_celular || "",
            item.cargo || "",
            item.empresa || "",
          ]
            .join(" ")
            .toLowerCase();
          return searchableText.includes(normalized);
        })
      : cachedAssistances;

    if (!attendanceTableBody) return;

    if (!data.length) {
      attendanceTableBody.innerHTML = `<tr><td colspan="6">No hay registros de asistencia.</td></tr>`;
      return;
    }

    attendanceTableBody.innerHTML = data
      .map((assist) => {
        const hasSignature = !!assist.firma;
        const statusColor = assist.asiste ? "#22c55e" : "#ef4444";
        const canAddSignature =
          canRegisterAttendance && assist.asiste && !hasSignature;
        return `
          <tr>
            <td data-label="Documento">${assist.numero_identificacion}</td>
            <td data-label="Nombre Completo">${assist.nombres} ${assist.apellidos}</td>
            <td data-label="Correo">${assist.correo_electronico || "—"}</td>
            <td data-label="Estado">
              <span class="status-indicator" style="background-color: ${statusColor}"></span>
            </td>
            <td data-label="Empresa">${assist.empresa || "—"}</td>
            <td data-label="Acciones" class="assist-actions">
              ${
                canAddSignature
                  ? `<button class="btn btn-small btn-outline" data-add-signature="${assist.id}">
                      Firma
                    </button>`
                  : hasSignature
                  ? `<span class="text-muted">Firmado</span>`
                  : "—"
              }
            </td>
          </tr>
        `;
      })
      .join("");

    // El selector se poblará cuando se abra el modal
  };

  const extractAttendanceForm = () => ({
    numero_identificacion: document
      .getElementById("attendeeDocument")
      .value.trim(),
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
    if (!canRegisterAttendance) return;
    
    // Si no hay evento seleccionado, intentar obtener el primero disponible
    if (!selectedEventId) {
      if (cachedEvents.length > 0) {
        selectedEventId = cachedEvents[0].id;
        if (eventName) {
          const selectedEvent = cachedEvents[0];
          eventName.textContent = `${selectedEvent.nombre} • ${selectedEvent.fecha}`;
        }
      } else {
        // Intentar cargar eventos si no hay ninguno
        await loadEvents();
        if (!selectedEventId) {
          console.error("No hay eventos disponibles para registrar asistencia");
          return;
        }
      }
    }

    const formValues = extractAttendanceForm();
    const requiredFields = ["numero_identificacion", "nombres", "apellidos"];

    const missing = requiredFields.filter((field) => !formValues[field]);
    if (missing.length) {
      return;
    }

    const existingAttendee = cachedAssistances.find(
      (a) =>
        a.numero_identificacion === formValues.numero_identificacion ||
        (formValues.correo_electronico &&
          a.correo_electronico === formValues.correo_electronico)
    );

    const isGuest = formValues.invitado === "1";
    const isExistingGuest = existingAttendee && existingAttendee.invitado;

    let signatureBlob = null;
    let signatureBase64 = null;

    if (signatureCanvas && signatureIsDirty) {
      signatureBlob = await getSignatureBlob();
      if (signatureBlob) {
        signatureBase64 = await blobToBase64(signatureBlob);
      }
    }

    if (isExistingGuest || (isGuest && existingAttendee)) {
      if (existingAttendee) {
        showLoading(true);
        try {
          await API.marcarLlegada(selectedEventId, existingAttendee.id, {
            firma: signatureBase64,
          });
          attendanceForm.reset();
          clearSignature();
          try {
            await loadAssistances(attendanceSearch.value);
          } catch (loadError) {
            console.error("Error al cargar asistencias", loadError);
          }
        } catch (error) {
          console.error("Error al actualizar asistencia", error);
        } finally {
          showLoading(false);
        }
        return;
      }
    }

    const formData = new FormData();
    formData.append("evento_id", selectedEventId);
    formData.append("user_id", session.id);
    formData.append("numero_identificacion", formValues.numero_identificacion);
    formData.append("nombres", formValues.nombres);
    formData.append("apellidos", formValues.apellidos);
    formData.append(
      "correo_electronico",
      formValues.correo_electronico || ""
    );
    formData.append("numero_celular", formValues.numero_celular || "");
    formData.append("cargo", formValues.cargo || "");
    formData.append("empresa", formValues.empresa || "");
    formData.append("invitado", formValues.invitado);

    if (!isGuest) {
      formData.append("asiste", "1");
    }
    formData.append("estado_id", "1");

    if (signatureBase64) {
      formData.append("firma", signatureBase64);
    }

    showLoading(true);
    try {
      const response = await API.registrarAsistencia(selectedEventId, formData);

      if (isGuest && !existingAttendee) {
        let asistenciaId =
          response?.id || response?.data?.id || response?.asistencia_id;

        if (!asistenciaId) {
          try {
            await loadAssistances(attendanceSearch.value);
            const nuevaAsistencia = cachedAssistances.find(
              (a) =>
                a.numero_identificacion === formValues.numero_identificacion &&
                a.correo_electronico === formValues.correo_electronico
            );
            if (nuevaAsistencia) {
              asistenciaId = nuevaAsistencia.id;
            }
          } catch (loadError) {
            console.error("Error al cargar asistencias para buscar ID", loadError);
          }
        }

        if (asistenciaId) {
          try {
            await API.marcarLlegada(selectedEventId, asistenciaId, {
              firma: signatureBase64,
            });
          } catch (marcarError) {
            console.error("Error al marcar llegada", marcarError);
          }
        }
      }

      attendanceForm.reset();
      clearSignature();
      try {
        await loadAssistances(attendanceSearch.value);
      } catch (loadError) {
        console.error("Error al cargar asistencias final", loadError);
      }
    } catch (error) {
      console.error("Error al registrar asistencia", error);
    } finally {
      showLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!cachedAssistances.length) return;
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
    ]);

    const csvContent = [header, ...rows]
      .map((cols) =>
        cols
          .map((col) => `"${String(col ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `asistencias_evento_${selectedEventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Menú hamburguesa
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

  // Manejar firma desde la tabla
  if (attendanceTableBody) {
    attendanceTableBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-add-signature]");
      if (!btn) return;

      const asistenciaId = Number(btn.dataset.addSignature);
      if (!asistenciaId || !signatureCanvas || !signatureIsDirty) return;

      showLoading(true);
      try {
        const signatureBlob = await getSignatureBlob();
        if (!signatureBlob) {
          showLoading(false);
          return;
        }

        const signatureBase64 = await blobToBase64(signatureBlob);
        await API.marcarLlegada(selectedEventId, asistenciaId, {
          firma: signatureBase64,
        });
        clearSignature();
        try {
          await loadAssistances(attendanceSearch.value);
        } catch (loadError) {
          console.error("Error al cargar asistencias", loadError);
        }
      } catch (error) {
        console.error("Error al agregar firma", error);
      } finally {
        showLoading(false);
      }
    });
  }

  attendanceForm.addEventListener("submit", handleFormSubmit);

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

  // Habilitar formulario siempre si tiene permisos
  if (canRegisterAttendance) {
    // Asegurar que el formulario de registro siempre esté habilitado
    if (attendanceForm) {
      attendanceForm.querySelectorAll("input, button, select").forEach((el) => {
        el.removeAttribute("disabled");
      });
    }
    setSignatureEnabled(true);
    
    // Habilitar sección "Marcar llegada" (modal)
    if (markArrivalModalBtn) markArrivalModalBtn.removeAttribute("disabled");
    if (signatureCanvasArrival) signatureCanvasArrival.style.pointerEvents = "auto";
    if (signatureClearBtnArrival) signatureClearBtnArrival.removeAttribute("disabled");
  } else {
    // Deshabilitar solo si no tiene permisos
    if (attendanceForm) {
      attendanceForm.querySelectorAll("input, button, select").forEach((el) => {
        if (el.type !== "button" && el.type !== "submit") {
          el.setAttribute("disabled", "true");
        }
      });
    }
    setSignatureEnabled(false);
    if (markArrivalModalBtn) markArrivalModalBtn.disabled = true;
    if (signatureCanvasArrival) signatureCanvasArrival.style.pointerEvents = "none";
    if (signatureClearBtnArrival) signatureClearBtnArrival.disabled = true;
  }

  // Event listeners para "Marcar llegada" (modal)
  if (markArrivalModalBtn) {
    markArrivalModalBtn.addEventListener("click", openMarkArrivalModal);
  }

  if (closeMarkArrivalModal) {
    closeMarkArrivalModal.addEventListener("click", closeMarkArrivalModalFunc);
  }

  if (cancelMarkArrivalBtn) {
    cancelMarkArrivalBtn.addEventListener("click", closeMarkArrivalModalFunc);
  }

  // Cerrar modal al hacer clic fuera
  if (markArrivalModal) {
    markArrivalModal.addEventListener("click", (e) => {
      if (e.target === markArrivalModal) {
        closeMarkArrivalModalFunc();
      }
    });
  }

  // Cerrar modal con ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && markArrivalModal && !markArrivalModal.hidden) {
      closeMarkArrivalModalFunc();
    }
  });

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

  // Asegurar que los overlays estén ocultos al inicio
  if (loadingOverlay) {
    loadingOverlay.hidden = true;
  }
  if (loadingOverlayArrival) {
    loadingOverlayArrival.hidden = true;
  }

  // Inicializar siempre el formulario si tiene permisos
  if (canRegisterAttendance) {
    if (attendanceForm) {
      attendanceForm.querySelectorAll("input, button, select").forEach((el) => {
        el.removeAttribute("disabled");
      });
    }
    setSignatureEnabled(true);
    if (markArrivalModalBtn) markArrivalModalBtn.removeAttribute("disabled");
    if (signatureCanvasArrival) signatureCanvasArrival.style.pointerEvents = "auto";
    if (signatureClearBtnArrival) signatureClearBtnArrival.removeAttribute("disabled");
  }

  initSignaturePad();
  initSignaturePadArrival();
  loadEvents();
});
