const API = (() => {
  const BASE_URL = "https://eventos.c4aapp.com/api";

  const buildUrl = (path) => {
    if (!path.startsWith("/")) {
      return `${BASE_URL}/${path}`;
    }
    return `${BASE_URL}${path}`;
  };

  const parseResponse = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return text ? { raw: text } : null;
    }
    const data = await response.json();
    return data;
  };

  const request = async (
    path,
    { method = "GET", headers = {}, body, requiresAuth = true } = {}
  ) => {
    const finalHeaders = { ...headers };
    const token = Storage.getToken();

    if (requiresAuth && token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }

    // Si el body es FormData, NO establecer Content-Type manualmente
    // El navegador lo establecerá automáticamente con el boundary correcto
    const isFormData = body instanceof FormData;
    if (isFormData && finalHeaders["Content-Type"]) {
      delete finalHeaders["Content-Type"];
    }

    const options = {
      method,
      headers: finalHeaders,
    };

    if (body !== undefined && body !== null) {
      options.body = body;
    }

    // LOGS: Verificar request antes de enviar
    if (body instanceof FormData) {
      console.log("=== REQUEST - LOGS FormData ===");
      console.log("URL:", buildUrl(path));
      console.log("Method:", method);
      console.log("Headers:", finalHeaders);
      console.log("Content-Type en headers:", finalHeaders["Content-Type"]);
      console.log("Body es FormData:", body instanceof FormData);
      
      // Verificar firmaNombre una vez más
      const firmaNombreCheck = body.get("firmaNombre");
      console.log("firmaNombre en body (FormData):", firmaNombreCheck);
      console.log("=== FIN REQUEST LOGS ===");
    }

    const response = await fetch(buildUrl(path), options);
    const payload = await parseResponse(response);

    if (!response.ok) {
      const message =
        payload?.mensaje ||
        payload?.message ||
        response.statusText ||
        "Error en la solicitud";
      throw new Error(message);
    }

    if (
      payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      payload.ok === false
    ) {
      throw new Error(payload?.mensaje || "La API reportó un error");
    }

    return payload;
  };

  const requestBlob = async (
    path,
    { method = "GET", headers = {}, body, requiresAuth = true } = {}
  ) => {
    const finalHeaders = { ...headers };
    const token = Storage.getToken();

    if (requiresAuth && token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }

    const options = {
      method,
      headers: finalHeaders,
    };

    if (body !== undefined && body !== null) {
      options.body = body;
    }

    const url = buildUrl(path);
    console.log(`[requestBlob] Solicitando: ${method} ${url}`);
    
    const response = await fetch(url, options);
    
    console.log(`[requestBlob] Respuesta recibida:`, {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      ok: response.ok
    });

    if (!response.ok) {
      let message = response.statusText;
      let errorDetails = null;
      try {
        // Intentar leer como texto primero para ver qué contiene
        const text = await response.text();
        console.log(`[requestBlob] Error response text:`, text);
        try {
          errorDetails = JSON.parse(text);
          message =
            errorDetails?.mensaje ||
            errorDetails?.message ||
            errorDetails?.error ||
            message;
        } catch (parseError) {
          // Si no es JSON, usar el texto como mensaje
          message = text || message;
        }
      } catch (error) {
        console.error("[requestBlob] Error al procesar respuesta de error:", error);
      }
      const finalError = new Error(message || `Error ${response.status}: ${response.statusText}`);
      finalError.status = response.status;
      finalError.details = errorDetails;
      throw finalError;
    }

    const blob = await response.blob();
    console.log(`[requestBlob] Blob creado:`, {
      type: blob.type,
      size: blob.size
    });
    
    return blob;
  };

  const toUrlEncoded = (data = {}) => {
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    return params.toString();
  };

  const login = (credentials) =>
    request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
      requiresAuth: false,
    });

  const getClientes = () => request("/v1/clientes");

  const crearCliente = (data) =>
    request("/v1/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

  const actualizarCliente = (clienteId, data) =>
    request(`/v1/clientes/${clienteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

  const listarEventos = (clienteId) => request(`/v1/listar-eventos/${clienteId}`);

  const listarEvento = (clienteId, eventoId) =>
    request(`/v1/listar-evento/${clienteId}/${eventoId}`);

  const crearEvento = (clienteId, data) =>
    request(`/v1/crear-evento/${clienteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toUrlEncoded(data),
    });

  const actualizarEvento = (clienteId, eventoId, data) =>
    request(`/v1/actualizar-evento/${clienteId}/${eventoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toUrlEncoded(data),
    });

  const listarAsistencia = (eventoId) =>
    request(`/v1/listar-asistencia/${eventoId}`);

  const buscarAsistencia = (eventoId, textoBuscado) =>
    request(`/v1/buscar-asistencia/${eventoId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento: Number(eventoId),
        textoBuscado,
      }),
    });

  const registrarAsistencia = (eventoId, formData) => {
    // LOGS: Verificar FormData antes de enviar
    console.log("=== API.registrarAsistencia - LOGS ===");
    console.log("Evento ID:", eventoId);
    console.log("FormData es instancia de FormData:", formData instanceof FormData);
    
    // Verificar firmaNombre específicamente
    if (formData instanceof FormData) {
      const firmaNombreValue = formData.get("firmaNombre");
      console.log("firmaNombre en FormData:", firmaNombreValue);
      console.log("Todas las claves del FormData en API:", Array.from(formData.keys()));
      
      // Verificar todos los valores
      console.log("Todos los valores del FormData en API:");
      for (const [key, value] of formData.entries()) {
        const displayValue = key === "firma" && value ? 
          `${value.substring(0, 30)}... (${value.length} chars)` : 
          value;
        console.log(`  ${key}:`, displayValue);
      }
    }
    console.log("=== FIN API.registrarAsistencia LOGS ===");
    
    return request(`/v1/registrar-asistencia/${eventoId}`, {
      method: "POST",
      body: formData,
    });
  };

  const actualizarEstadoAsistencia = (eventoId, asistenciaId, estado) =>
    request(`/v1/actualizar-asistencia/${eventoId}/${asistenciaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asiste: Number(Boolean(estado)) }),
    });

  const marcarLlegada = (eventoId, asistenciaId, data = {}) => {
    const body = {
      evento: Number(eventoId),
      id: Number(asistenciaId),
    };

    if (data.firma) {
      body.firma = data.firma;
    }

    return request(`/v1/marcar-llegada/${eventoId}/${asistenciaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  const descargarActaEvento = (eventoId) =>
    requestBlob(`/v1/acta-evento/${eventoId}`, {
      method: "GET",
    });

  const descargarListaAsistentesExcel = (eventoId) =>
    requestBlob(`/v1/descargar-lista-asistentes/${eventoId}`, {
      method: "GET",
    });

  const descargarInformeEventoPdf = (eventoId) =>
    requestBlob(`/v1/informe-evento/${eventoId}`, {
      method: "GET",
    });

  return {
    login,
    getClientes,
    crearCliente,
    actualizarCliente,
    listarEventos,
    listarEvento,
    crearEvento,
    actualizarEvento,
    listarAsistencia,
    buscarAsistencia,
    registrarAsistencia,
    actualizarEstadoAsistencia,
    marcarLlegada,
    descargarActaEvento,
    descargarListaAsistentesExcel,
    descargarInformeEventoPdf,
  };
})();
