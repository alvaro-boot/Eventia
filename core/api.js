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

    const options = {
      method,
      headers: finalHeaders,
    };

    if (body !== undefined && body !== null) {
      options.body = body;
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

    const response = await fetch(buildUrl(path), options);

    if (!response.ok) {
      let message = response.statusText;
      try {
        const errorPayload = await response.json();
        message =
          errorPayload?.mensaje ||
          errorPayload?.message ||
          errorPayload?.error ||
          message;
      } catch (error) {
        // ignore json parse errors
      }
      throw new Error(message || "Error en la solicitud");
    }

    return response.blob();
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

  const registrarAsistencia = (eventoId, formData) =>
    request(`/v1/registrar-asistencia/${eventoId}`, {
      method: "POST",
      body: formData,
    });

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
  };
})();
