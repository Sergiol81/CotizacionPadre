// ==================== DATOS ====================
// Dos tipos de documento: "cotizacion" y "cobro" (cuenta de cobro).
const TIPOS = {
  cotizacion: { nombre: "cotización", titulo: "Cotización", archivo: "Cotizacion" },
  cobro:      { nombre: "cuenta de cobro", titulo: "Cuenta de cobro", archivo: "Cuenta_de_cobro" }
};
const CAMPOS = ["ciudad","fecha","tratamiento","cliente","ciudadCliente","referencia","intro",
                "numero","tipoDoc","nit","totalManual"];
const CAMPOS_FIRMA = ["firmaNombre","firmaNombreCompleto","firmaCC","notaIva","telefono","correo","datosPago"];
const CLAVE_ACTUAL = "cotiz_actual";
const CLAVE_HISTORIAL = "cotiz_historial";
const CLAVE_FIRMA = "cotiz_firma";
const CLAVE_LOGO = "cotiz_logo";
const CLAVE_FIRMA_IMG = "cotiz_firma_img";
const MAX_HISTORIAL = 60;
const INTRO_DEFECTO = document.getElementById("intro").value;
const CONDICIONES_DEFECTO = [
  "Validez de la cotización 15 días",
  "Forma de pago 50% inicio obra, 25% mitad obra, 25% entrega obra"
];

let idActual = nuevoId();
let tipoActual = "cotizacion";
let items = [itemVacio()];
let incluirMetros = true;
let condiciones = CONDICIONES_DEFECTO.slice();
let logoActual = LOGO_BASE64;
let firmaImg = FIRMA_BASE64;

function nuevoId(){ return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function itemVacio(){ return {desc:"", metros:"", unit:"", total:""}; }
// Los metros y el precio por m² solo existen en la cotización
function usaMetros(){ return tipoActual === "cotizacion" && incluirMetros; }

// ==================== UTILIDADES ====================
function esc(t){
  return String(t==null ? "" : t)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function soloDigitos(v){ return String(v==null ? "" : v).replace(/\D/g,""); }
function formatoMoneda(valor){
  const d = soloDigitos(valor);
  return d ? Number(d).toLocaleString("es-CO") : "";
}
function parseMetros(v){
  const n = parseFloat(String(v||"").replace(/\s/g,"").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function sumarTotal(lista){
  return lista.reduce((s,it)=>s + (parseInt(soloDigitos(it.total),10) || 0), 0);
}
// En la cuenta de cobro se puede poner solo el total, sin precio en cada trabajo
function totalDocumento(tipo, lista, totalManual){
  const suma = sumarTotal(lista);
  if (suma > 0 || tipo !== "cobro") return suma;
  return parseInt(soloDigitos(totalManual), 10) || 0;
}

// Fecha local (toISOString usa hora UTC y en la noche de Colombia daba el día siguiente)
function hoy(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function fechaLarga(iso){
  if(!iso) return "";
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const [y,m,d] = iso.split("-").map(x=>parseInt(x,10));
  return `${d} de ${meses[m-1]} de ${y}`;
}
// Número de cuenta de cobro a partir de la fecha: 2026-06-09 -> 09062026
function numeroDesdeFecha(iso){
  if(!iso) return "";
  const [y,m,d] = iso.split("-");
  return d + m + y;
}
function irA(id){
  document.getElementById(id).scrollIntoView({behavior:"smooth", block:"start"});
}

// ==================== VENTANA DE AVISOS ====================
// botones: [{texto, clase, accion}]. Cada botón cierra la ventana y luego hace su acción.
function mostrarModal(titulo, cuerpoHtml, botones){
  document.getElementById("modalTitulo").textContent = titulo;
  document.getElementById("modalCuerpo").innerHTML = cuerpoHtml;
  const cont = document.getElementById("modalBotones");
  cont.innerHTML = "";
  (botones || [{texto:"Entendido", clase:"btn-gris"}]).forEach(b=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn " + (b.clase || "btn-gris");
    btn.textContent = b.texto;
    btn.onclick = ()=>{ cerrarModal(); if(b.accion) b.accion(); };
    cont.appendChild(btn);
  });
  document.getElementById("modalFondo").hidden = false;
}
function cerrarModal(){ document.getElementById("modalFondo").hidden = true; }
document.addEventListener("keydown", e=>{ if(e.key==="Escape") cerrarModal(); });

// ==================== TIPO DE DOCUMENTO ====================
// Ajusta la pantalla al tipo elegido (el CSS oculta lo que no corresponde)
function aplicarTipo(){
  document.body.dataset.tipo = tipoActual;
  Object.keys(TIPOS).forEach(t=>{
    const tarjeta = document.getElementById("tipo-" + t);
    tarjeta.classList.toggle("activa", t === tipoActual);
    tarjeta.setAttribute("aria-pressed", t === tipoActual ? "true" : "false");
  });
  document.getElementById("nombreTipo").textContent = TIPOS[tipoActual].nombre;
  document.getElementById("cliente").placeholder =
    tipoActual === "cobro" ? "Ej: Industrias Lácteas El Nogal" : "Ej: Luz Dary";
}

function elegirTipo(tipo){
  if (tipo === tipoActual) return;
  const q = obtenerEstado();
  // Si no hay nada escrito, simplemente se cambia
  if (!tieneContenido(q)) {
    tipoActual = tipo;
    aplicarTipo();
    renderFormItems();
    cambio();
    return;
  }
  const actual = TIPOS[tipoActual].nombre;
  const nuevo = TIPOS[tipo].nombre;
  mostrarModal(
    `¿Hacer una ${nuevo}?`,
    `<p>La ${actual} que tienes abierta <b>no se pierde</b>: queda guardada en “Ver las anteriores”.</p>
     <p>¿Quieres usar el mismo cliente y los mismos trabajos?</p>`,
    [
      {texto:`Sí, con los mismos datos`, clase:"btn-naranja", accion:()=>empezarNueva(tipo, true)},
      {texto:`No, empezar en blanco`, clase:"btn-sec", accion:()=>empezarNueva(tipo, false)},
      {texto:"Cancelar", clase:"btn-gris"}
    ]
  );
}

// ==================== FORMULARIO: ÍTEMS ====================
function renderFormItems(){
  const cont = document.getElementById("listaItems");
  const metros = usaMetros();
  const cobro = tipoActual === "cobro";
  cont.innerHTML = items.map((it,i)=>`
    <div class="item-card" id="item-${i}">
      <div class="item-head">
        <span class="num">Trabajo ${i+1}</span>
        ${items.length>1 ? `<button type="button" class="btn-quitar" onclick="pedirQuitarItem(${i})">Quitar</button>` : ""}
      </div>
      <div class="campo">
        <label for="desc-${i}">¿Qué trabajo es?</label>
        <textarea id="desc-${i}" rows="3" placeholder="${cobro ? "Ej: Suministro mesón en granito negro" : "Ej: Pañete y pintura de muros"}" oninput="items[${i}].desc=this.value; cambio()">${esc(it.desc)}</textarea>
      </div>
      ${cobro ? "" : metros ? `
      <div class="fila2">
        <div class="campo">
          <label for="metros-${i}">Metros (m²)</label>
          <input id="metros-${i}" inputmode="decimal" placeholder="Ej: 12,5" value="${esc(it.metros)}" oninput="onMetros(this,${i})">
        </div>
        <div class="campo">
          <label for="unit-${i}">Precio por m²</label>
          <div class="dinero"><input id="unit-${i}" inputmode="numeric" value="${formatoMoneda(it.unit)}" oninput="onDinero(this,${i},'unit')"></div>
        </div>
      </div>
      <div class="pista" style="margin:-6px 0 12px 0;">Si llenas los metros y el precio por m², el total se calcula solo.</div>
      ` : `
      <div class="campo">
        <label for="unit-${i}">Valor unitario <span class="opc">(opcional)</span></label>
        <div class="dinero"><input id="unit-${i}" inputmode="numeric" value="${formatoMoneda(it.unit)}" oninput="onDinero(this,${i},'unit')"></div>
      </div>
      `}
      <div class="campo" style="margin-bottom:0;">
        <label for="total-${i}">${cobro ? `Valor de este trabajo <span class="opc">(opcional)</span>` : "Valor total de este trabajo"}</label>
        <div class="dinero"><input id="total-${i}" inputmode="numeric" value="${formatoMoneda(it.total)}" oninput="onDinero(this,${i},'total')"></div>
      </div>
    </div>
  `).join("");
}

// Pone los puntos de miles mientras se escribe (1500000 -> 1.500.000)
function onDinero(el, i, campo){
  const d = soloDigitos(el.value);
  el.value = d ? Number(d).toLocaleString("es-CO") : "";
  items[i][campo] = d;
  if(campo === "unit") autoCalcular(i);
  cambio();
}
function onTotalManual(el){
  const d = soloDigitos(el.value);
  el.value = d ? Number(d).toLocaleString("es-CO") : "";
  cambio();
}
function onMetros(el, i){
  items[i].metros = el.value;
  autoCalcular(i);
  cambio();
}
// Total = metros x precio por m² (solo si ambos están llenos)
function autoCalcular(i){
  if(!usaMetros()) return;
  const m = parseMetros(items[i].metros);
  const u = parseInt(items[i].unit, 10);
  if(m > 0 && u > 0){
    const t = Math.round(m * u);
    items[i].total = String(t);
    const inp = document.getElementById("total-" + i);
    if(inp) inp.value = t.toLocaleString("es-CO");
  }
}

function toggleMetros(){
  incluirMetros = document.getElementById("incluirMetros").checked;
  renderFormItems();
  cambio();
}
function agregarItem(){
  items.push(itemVacio());
  renderFormItems();
  cambio();
  const nuevo = document.getElementById("desc-" + (items.length-1));
  nuevo.scrollIntoView({behavior:"smooth", block:"center"});
  nuevo.focus({preventScroll:true});
}
function quitarItem(i){
  items.splice(i,1);
  renderFormItems();
  cambio();
}
function pedirQuitarItem(i){
  const it = items[i];
  if(!it.desc.trim() && !it.total && !it.unit && !it.metros){ quitarItem(i); return; }
  mostrarModal(
    `¿Quitar el trabajo ${i+1}?`,
    it.desc.trim() ? `<p>“${esc(it.desc.trim().slice(0,120))}”</p>` : "",
    [
      {texto:"Sí, quitarlo", clase:"btn-rojo", accion:()=>quitarItem(i)},
      {texto:"No, dejarlo", clase:"btn-gris"}
    ]
  );
}

// ==================== FORMULARIO: CONDICIONES ====================
function renderFormCondiciones(){
  const cont = document.getElementById("listaCondiciones");
  cont.innerHTML = condiciones.map((c,i)=>`
    <div class="terminos-item">
      <input value="${esc(c)}" placeholder="Escribe la condición" aria-label="Condición ${i+1}" oninput="condiciones[${i}]=this.value; cambio()">
      ${condiciones.length>1 ? `<button type="button" onclick="pedirQuitarCondicion(${i})">Quitar</button>` : ""}
    </div>
  `).join("");
}
function agregarCondicion(){
  condiciones.push("");
  renderFormCondiciones();
  cambio();
  const inputs = document.querySelectorAll("#listaCondiciones input");
  inputs[inputs.length-1].focus();
}
function quitarCondicion(i){
  condiciones.splice(i,1);
  renderFormCondiciones();
  cambio();
}
function pedirQuitarCondicion(i){
  if(!condiciones[i].trim()){ quitarCondicion(i); return; }
  mostrarModal("¿Quitar esta condición?", `<p>“${esc(condiciones[i])}”</p>`, [
    {texto:"Sí, quitarla", clase:"btn-rojo", accion:()=>quitarCondicion(i)},
    {texto:"No, dejarla", clase:"btn-gris"}
  ]);
}

// ==================== LOGO Y FIRMA ====================
// Las fotos del celular pesan mucho; se achican antes de guardarlas para que
// quepan en la memoria del navegador. "limpiarFondo" vuelve blanco el papel
// de la foto de la firma para que no salga grisáceo.
function reducirImagen(archivo, anchoMax, limpiarFondo){
  return new Promise((resolve, reject)=>{
    const lector = new FileReader();
    lector.onerror = reject;
    lector.onload = e=>{
      const img = new Image();
      img.onerror = reject;
      img.onload = ()=>{
        const escala = Math.min(1, anchoMax / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (limpiarFondo) {
          const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const p = datos.data;
          for (let k = 0; k < p.length; k += 4) {
            const lum = 0.299*p[k] + 0.587*p[k+1] + 0.114*p[k+2];
            if (lum > 165) { p[k] = p[k+1] = p[k+2] = 255; }
          }
          ctx.putImageData(datos, 0, 0);
        }
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = e.target.result;
    };
    lector.readAsDataURL(archivo);
  });
}
function errorImagen(){
  mostrarModal("No se pudo usar esa imagen", "<p>Intenta con otra foto.</p>");
}

function cargarLogo(evento){
  const archivo = evento.target.files[0];
  if(!archivo) return;
  reducirImagen(archivo, 1500, false).then(dataUrl=>{
    logoActual = dataUrl;
    try{ localStorage.setItem(CLAVE_LOGO, logoActual); }catch(err){}
    actualizarBotonesImagenes();
    render();
  }).catch(errorImagen);
}
function logoOriginal(){
  logoActual = LOGO_BASE64;
  try{ localStorage.removeItem(CLAVE_LOGO); }catch(err){}
  document.getElementById("logoInput").value = "";
  actualizarBotonesImagenes();
  render();
}
function cargarFirma(evento){
  const archivo = evento.target.files[0];
  if(!archivo) return;
  reducirImagen(archivo, 600, true).then(dataUrl=>{
    firmaImg = dataUrl;
    try{ localStorage.setItem(CLAVE_FIRMA_IMG, firmaImg); }catch(err){}
    actualizarBotonesImagenes();
    render();
  }).catch(errorImagen);
}
// "ninguna" recuerda que él decidió no poner firma (para no volver a la original)
function quitarFirma(){
  firmaImg = "";
  try{ localStorage.setItem(CLAVE_FIRMA_IMG, "ninguna"); }catch(err){}
  document.getElementById("firmaInput").value = "";
  actualizarBotonesImagenes();
  render();
}
function firmaOriginal(){
  firmaImg = FIRMA_BASE64;
  try{ localStorage.removeItem(CLAVE_FIRMA_IMG); }catch(err){}
  document.getElementById("firmaInput").value = "";
  actualizarBotonesImagenes();
  render();
}
function actualizarBotonesImagenes(){
  document.getElementById("btnLogoOriginal").hidden = (logoActual === LOGO_BASE64);
  document.getElementById("btnQuitarFirma").hidden = !firmaImg;
  document.getElementById("btnFirmaOriginal").hidden = (firmaImg === FIRMA_BASE64);
}

// ==================== VISTA PREVIA ====================
function leerFormulario(){
  const d = {};
  CAMPOS.concat(CAMPOS_FIRMA).forEach(id=>{ d[id] = document.getElementById(id).value; });
  return d;
}

function render(){
  const d = leerFormulario();
  const sumaItems = sumarTotal(items);
  const total = totalDocumento(tipoActual, items, d.totalManual);

  document.getElementById("hoja").innerHTML =
    tipoActual === "cobro" ? hojaCobro(d, total) : hojaCotizacion(d, total);

  document.getElementById("totalForm").textContent = "$" + (formatoMoneda(total) || "0");
  // El "Total a pagar" a mano solo aparece si ningún trabajo tiene precio
  document.getElementById("campoTotalManual").hidden = !(tipoActual === "cobro" && sumaItems === 0);
  document.getElementById("numero").placeholder = "Se pone solo: " + numeroDesdeFecha(d.fecha);
}

// La imagen de la firma solo va en la cuenta de cobro
function bloqueFirma(d, conImagen){
  return `
    ${conImagen && firmaImg ? `<img class="firmaImg" src="${firmaImg}" alt="Firma">` : ""}
    <p>${esc(d.firmaNombre.toUpperCase())}</p>
    <p>C.C ${esc(d.firmaCC)}</p>`;
}
function piePagina(d){
  return `
    <div class="piePagina">
      ${d.telefono ? "Movil "+esc(d.telefono)+"<br>" : ""}${d.correo ? "E-mail "+esc(d.correo) : ""}
    </div>`;
}

function hojaCotizacion(d, total){
  const metros = usaMetros();
  const filas = items.map((it,i)=>`
      <tr>
        <td class="num">${i+1}</td>
        <td>${it.desc.trim() ? esc(it.desc).replace(/\n/g,"<br>") : '<span class="vacio">Descripción del trabajo</span>'}</td>
        ${metros ? `<td class="val">${it.metros ? esc(String(it.metros).replace(".", ","))+" m²" : ""}</td>` : ""}
        <td class="val">${it.unit ? "$"+formatoMoneda(it.unit) : ""}</td>
        <td class="val">${it.total ? "$"+formatoMoneda(it.total) : ""}</td>
      </tr>
  `).join("");

  const condicionesHtml = condiciones.filter(c=>c.trim()!=="").map(c=>`<li>${esc(c)}</li>`).join("");

  return `
    <div class="membrete"><img src="${logoActual}" alt="Logo empresa"></div>
    <div class="contenido">
      <div class="fechaLinea">${esc(d.ciudad || "Ciudad")} ${fechaLarga(d.fecha)}</div>
      <div class="destinatario">
        <p>${esc(d.tratamiento)} :</p>
        <p>${esc((d.cliente || "___________").toUpperCase())}</p>
        <p>${esc(d.ciudadCliente)}</p>
      </div>
      <div class="ref">Ref: ${esc((d.referencia || "___________").toUpperCase())}</div>
      <div class="intro">${esc(d.intro).replace(/\n/g,"<br>")}</div>
      <table class="cot">
        <thead>
          <tr>
            <th style="width:6%">ITEM</th>
            <th>DESCRIPCION</th>
            ${metros ? `<th style="width:12%">M²</th>` : ""}
            <th style="width:${metros ? 15 : 16}%">VR UNITARIO</th>
            <th style="width:${metros ? 15 : 16}%">VR TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
        <tfoot>
          <tr><td colspan="${metros ? 4 : 3}">TOTAL</td><td class="val">$${formatoMoneda(total)}</td></tr>
        </tfoot>
      </table>
      <div class="condiciones">
        <ul>${condicionesHtml}</ul>
      </div>
      <div class="firma">${bloqueFirma(d)}</div>
      ${piePagina(d)}
    </div>
  `;
}

// Mismo formato de la cuenta de cobro que usa en Word
function hojaCobro(d, total){
  const filas = items.map((it,i)=>`
      <tr>
        <td class="num">${i+1}</td>
        <td><b>${it.desc.trim() ? esc(it.desc).replace(/\n/g,"<br>") : '<span class="vacio">Descripción del trabajo</span>'}</b></td>
        <td class="val">${it.total ? "$ "+formatoMoneda(it.total) : ""}</td>
      </tr>
  `).join("");
  const numero = d.numero.trim() || numeroDesdeFecha(d.fecha);
  const nit = d.nit.trim();

  return `
    <div class="membrete"><img src="${logoActual}" alt="Logo empresa"></div>
    <div class="contenido">
      <div class="fechaLinea">${esc(d.ciudad || "Ciudad")} ${fechaLarga(d.fecha)}</div>
      <div class="numeroCuenta">CUENTA DE COBRO No ${esc(numero)}</div>
      <div class="bloqueCentro">
        <p>${esc((d.cliente || "___________").toUpperCase())}</p>
        ${nit ? `<p>${esc(d.tipoDoc)} ${esc(nit)}</p>` : ""}
      </div>
      <div class="bloqueCentro debeA">
        <p>DEBE A :</p>
        <p>${esc((d.firmaNombreCompleto || d.firmaNombre).toUpperCase())}</p>
        ${d.notaIva.trim() ? `<p>${esc(d.notaIva.toUpperCase())}</p>` : ""}
        <p>C.C ${esc(d.firmaCC)}</p>
      </div>
      <div class="bloqueCentro">POR CONCEPTO DE:</div>
      <table class="cot">
        <thead>
          <tr>
            <th style="width:8%">ITEM</th>
            <th>DESCRIPCION</th>
            <th style="width:22%">VR TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
        <tfoot>
          <tr><td></td><td class="etiqueta-total">TOTAL A PAGAR</td><td class="val">$ ${formatoMoneda(total) || "0"}</td></tr>
        </tfoot>
      </table>
      ${d.datosPago.trim() ? `<div class="datosPago">${esc(d.datosPago).replace(/\n/g,"<br>")}</div>` : ""}
      <div class="firma firmaTitulo">
        <div>FIRMA</div>
        <div class="firmaCobro">${bloqueFirma(d, true)}</div>
      </div>
      ${piePagina(d)}
    </div>
  `;
}

// ==================== GUARDADO AUTOMÁTICO ====================
// Todo se guarda en el navegador de este equipo/celular. Cada documento con
// contenido queda además en "Ver las anteriores".
function leer(clave, porDefecto){
  try{
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : porDefecto;
  }catch(e){ return porDefecto; }
}
function escribir(clave, valor){
  try{ localStorage.setItem(clave, JSON.stringify(valor)); return true; }
  catch(e){ return false; }
}

function obtenerEstado(){
  const campos = {};
  CAMPOS.forEach(id=>{ campos[id] = document.getElementById(id).value; });
  return {
    id: idActual,
    tipo: tipoActual,
    campos,
    items: items.map(x=>({...x})),
    condiciones: condiciones.slice(),
    incluirMetros,
    actualizado: Date.now()
  };
}
function tieneContenido(q){
  return q.campos.cliente.trim() || (q.campos.referencia || "").trim() ||
         q.items.some(it=>it.desc.trim() || soloDigitos(it.total));
}
function aplicarEstado(q){
  idActual = q.id || nuevoId();
  tipoActual = TIPOS[q.tipo] ? q.tipo : "cotizacion";
  CAMPOS.forEach(id=>{
    const el = document.getElementById(id);
    if (q.campos && q.campos[id] != null) el.value = q.campos[id];
    else if (el.tagName === "SELECT") el.selectedIndex = 0;
    else el.value = "";
  });
  items = (q.items && q.items.length)
    ? q.items.map(x=>{
        const it = {...itemVacio(), ...x};
        it.unit = soloDigitos(it.unit);
        it.total = soloDigitos(it.total);
        return it;
      })
    : [itemVacio()];
  condiciones = (Array.isArray(q.condiciones) && q.condiciones.length) ? q.condiciones.slice() : CONDICIONES_DEFECTO.slice();
  incluirMetros = q.incluirMetros !== false;
  document.getElementById("incluirMetros").checked = incluirMetros;
  aplicarTipo();
  renderFormItems();
  renderFormCondiciones();
  render();
}

let temporizadorGuardado = null;
function cambio(){
  render();
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(guardarAhora, 400);
}
function guardarAhora(){
  clearTimeout(temporizadorGuardado);
  const q = obtenerEstado();
  const firma = {};
  CAMPOS_FIRMA.forEach(id=>{ firma[id] = document.getElementById(id).value; });

  let ok = escribir(CLAVE_ACTUAL, q);
  ok = escribir(CLAVE_FIRMA, firma) && ok;
  if(tieneContenido(q)){
    const historial = leer(CLAVE_HISTORIAL, []).filter(h=>h.id !== q.id);
    historial.unshift(q);
    ok = escribir(CLAVE_HISTORIAL, historial.slice(0, MAX_HISTORIAL)) && ok;
  }

  const el = document.getElementById("estadoGuardado");
  el.textContent = ok ? "Guardado" : "No se pudo guardar";
  el.classList.toggle("error", !ok);
  actualizarContadorAnteriores();
}
function actualizarContadorAnteriores(){
  document.getElementById("numAnteriores").textContent = leer(CLAVE_HISTORIAL, []).length;
}

// ==================== NUEVA / ANTERIORES ====================
function pedirNueva(){
  mostrarModal(
    "¿Qué vas a hacer?",
    "<p>Lo que tienes abierto ahora <b>no se pierde</b>: queda guardado en “Ver las anteriores”.</p>",
    [
      {texto:"Una cotización nueva", clase:"btn-naranja", accion:()=>empezarNueva("cotizacion", false)},
      {texto:"Una cuenta de cobro nueva", clase:"btn-naranja", accion:()=>empezarNueva("cobro", false)},
      {texto:"Cancelar, seguir con esta", clase:"btn-gris"}
    ]
  );
}
// conDatos: copia el cliente y los trabajos del documento abierto (por ejemplo,
// para hacer la cuenta de cobro de un trabajo que antes se cotizó)
function empezarNueva(tipo, conDatos){
  guardarAhora();
  const base = obtenerEstado();
  const campos = {
    ciudad: base.campos.ciudad || "Bogotá",
    fecha: hoy(),
    tratamiento: "Señor",
    cliente: "",
    ciudadCliente: "",
    referencia: "",
    intro: INTRO_DEFECTO,
    numero: "",
    tipoDoc: "NIT",
    nit: "",
    totalManual: ""
  };
  if (conDatos) {
    ["tratamiento","cliente","ciudadCliente","referencia","intro","tipoDoc","nit","totalManual"]
      .forEach(k=>{ campos[k] = base.campos[k]; });
  }
  aplicarEstado({
    id: nuevoId(),
    tipo,
    campos,
    items: conDatos ? base.items : [itemVacio()],
    condiciones: condiciones.filter(c=>c.trim()!==""),
    incluirMetros
  });
  guardarAhora();
  irA("formulario");
}

function abrirAnteriores(){
  guardarAhora();
  const historial = leer(CLAVE_HISTORIAL, []);
  if(!historial.length){
    mostrarModal("Documentos anteriores",
      "<p>Todavía no hay nada guardado. Apenas escribas una cotización o cuenta de cobro, aparecerá aquí.</p>");
    return;
  }
  const lista = historial.map(h=>{
    const esActual = h.id === idActual;
    const tipo = TIPOS[h.tipo] ? h.tipo : "cotizacion";
    const total = totalDocumento(tipo, h.items, h.campos.totalManual);
    return `
      <div class="anterior ${esActual ? "actual" : ""}">
        <span class="tipo-doc ${tipo}">${TIPOS[tipo].titulo}</span>
        <div class="titulo">${esc(h.campos.cliente.trim() || "Sin nombre de cliente")}</div>
        <div class="detalle">
          ${(h.campos.referencia || "").trim() ? esc(h.campos.referencia) + "<br>" : ""}
          Total $${formatoMoneda(total) || "0"} · ${fechaLarga(h.campos.fecha)}
        </div>
        ${esActual
          ? `<div class="etiqueta">Es la que tienes abierta ahora</div>`
          : `<div class="acc">
               <button type="button" class="btn btn-sec" onclick="abrirAnterior('${h.id}')">Abrir</button>
               <button type="button" class="btn btn-gris" onclick="pedirBorrarAnterior('${h.id}')">Borrar</button>
             </div>`}
      </div>`;
  }).join("");
  mostrarModal("Documentos anteriores",
    `<p>Toca <b>Abrir</b> para verla, cambiarla o volver a descargarla.</p>${lista}`,
    [{texto:"Cerrar", clase:"btn-gris"}]);
}
function abrirAnterior(id){
  cerrarModal();
  guardarAhora();
  const q = leer(CLAVE_HISTORIAL, []).find(h=>h.id === id);
  if(!q) return;
  aplicarEstado(q);
  guardarAhora();
  irA("formulario");
}
function pedirBorrarAnterior(id){
  const q = leer(CLAVE_HISTORIAL, []).find(h=>h.id === id);
  if(!q) return;
  const tipo = TIPOS[q.tipo] ? q.tipo : "cotizacion";
  mostrarModal(`¿Borrar esta ${TIPOS[tipo].nombre}?`,
    `<p>Se borrará la ${TIPOS[tipo].nombre} de <b>${esc(q.campos.cliente.trim() || "Sin nombre")}</b>. Esto no se puede deshacer.</p>`,
    [
      {texto:"Sí, borrarla", clase:"btn-rojo", accion:()=>{
        escribir(CLAVE_HISTORIAL, leer(CLAVE_HISTORIAL, []).filter(h=>h.id !== id));
        actualizarContadorAnteriores();
        abrirAnteriores();
      }},
      {texto:"No, volver", clase:"btn-gris", accion:abrirAnteriores}
    ]);
}

// ==================== PDF ====================
function esperarImagenes(elemento){
  const imgs = Array.from(elemento.querySelectorAll('img'));
  return Promise.all(imgs.map(img => {
    // Si ya está cargada y decodificada, no hay que esperar nada
    if (img.complete && img.naturalWidth > 0) {
      return (img.decode ? img.decode().catch(()=>{}) : Promise.resolve());
    }
    return new Promise(resolve => {
      img.onload = () => {
        if (img.decode) img.decode().then(resolve).catch(resolve);
        else resolve();
      };
      img.onerror = resolve;
    });
  }));
}

function nombreArchivoPDF(){
  const cliente = document.getElementById("cliente").value.trim() || "cliente";
  const limpio = cliente.normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  return TIPOS[tipoActual].archivo + "_" + (limpio || "cliente") + ".pdf";
}

let generandoPDF = false;
function descargarPDF(){
  if (generandoPDF) return;
  generandoPDF = true;
  guardarAhora();

  const botones = document.querySelectorAll(".btn-pdf");
  botones.forEach(b => { b.disabled = true; b.dataset.texto = b.textContent; b.textContent = "Preparando PDF..."; });

  const nombreArchivo = nombreArchivoPDF();
  const hoja = document.getElementById("hoja");
  const esIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const opciones = {
    margin: 0,
    filename: nombreArchivo,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      imageTimeout: 15000,
      logging: false,
      // Clave del arreglo: si la ventana está desplazada (scroll), html2canvas
      // captura la región equivocada y el documento sale en blanco o con la
      // imagen movida/cortada. Forzamos scroll 0,0 para que siempre capture
      // desde el origen real del documento.
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight
    },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  // 1) Llevar la ventana al inicio antes de capturar.
  window.scrollTo(0, 0);

  // 2) Esperar a que el logo esté 100% decodificado.
  // 3) Esperar un frame extra para que el navegador termine de acomodar el
  //    scroll y el layout antes de que html2canvas tome la "foto".
  esperarImagenes(hoja).then(() => {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }).then(() => {
    return html2pdf().set(opciones).from(hoja).outputPdf('blob');
  }).then((blob) => {
    mostrarPdfListo(blob, nombreArchivo, esIOS);
  }).catch((error) => {
    console.error("Error generando el PDF:", error);
    mostrarModal("No se pudo crear el PDF",
      "<p>Intenta de nuevo. Si sigue fallando, revisa que el celular tenga <b>internet</b>.</p>");
  }).finally(() => {
    generandoPDF = false;
    botones.forEach(b => { b.disabled = false; b.textContent = b.dataset.texto; });
  });
}

// El PDF ya está hecho: se muestra una ventana con botones grandes. Enviar o
// guardar ocurre con un toque nuevo, porque los navegadores (sobre todo el del
// iPhone) solo permiten compartir archivos justo después de que la persona toca.
function mostrarPdfListo(blob, nombreArchivo, esIOS){
  const url = URL.createObjectURL(blob);
  let archivo = null;
  try { archivo = new File([blob], nombreArchivo, { type: "application/pdf" }); } catch (e) {}
  let puedeCompartir = false;
  try { puedeCompartir = !!(archivo && navigator.canShare && navigator.canShare({ files: [archivo] })); } catch (e) {}

  const botones = [];
  if (puedeCompartir) {
    botones.push({ texto: "Enviar por WhatsApp o correo", clase: "btn-verde",
      accion: () => navigator.share({ files: [archivo] }).catch(() => {}) });
  }
  botones.push({ texto: esIOS ? "Abrir el PDF" : "Guardar el PDF",
    clase: puedeCompartir ? "btn-sec" : "btn-naranja",
    accion: () => guardarArchivo(url, nombreArchivo, esIOS) });
  botones.push({ texto: "Cerrar", clase: "btn-gris" });

  let ayuda;
  if (puedeCompartir) {
    ayuda = "<p>Toca <b>Enviar por WhatsApp o correo</b>, escoge WhatsApp y luego el contacto del cliente.</p>";
  } else if (esIOS) {
    ayuda = "<p>Toca <b>Abrir el PDF</b>. Después toca el botón de compartir para enviarlo o guardarlo. Para volver aquí, usa la flecha de atrás.</p>";
  } else {
    ayuda = "<p>Toca <b>Guardar el PDF</b>. El archivo queda en la carpeta de <b>Descargas</b>.</p>";
  }
  mostrarModal(`¡Tu ${TIPOS[tipoActual].nombre} está lista!`, ayuda, botones);
}

function guardarArchivo(url, nombreArchivo, esIOS){
  if (esIOS) {
    // En Safari de iPhone/iPad un blob creado en esta página SOLO es válido
    // dentro de esta misma pestaña; en una pestaña nueva Safari lo bloquea.
    // Por eso navegamos la MISMA pestaña hacia el PDF (el botón "atrás"
    // regresa al formulario, y los datos siguen guardados).
    window.location.href = url;
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

// ==================== INICIO ====================
(function iniciar(){
  document.getElementById("fecha").value = hoy();

  const firma = leer(CLAVE_FIRMA, null);
  if (firma) CAMPOS_FIRMA.forEach(id => { if (firma[id] != null) document.getElementById(id).value = firma[id]; });

  try { const logo = localStorage.getItem(CLAVE_LOGO); if (logo) logoActual = logo; } catch (e) {}
  firmaImg = FIRMA_BASE64;
  try {
    const guardada = localStorage.getItem(CLAVE_FIRMA_IMG);
    if (guardada === "ninguna") firmaImg = "";
    else if (guardada) firmaImg = guardada;
  } catch (e) {}

  const actual = leer(CLAVE_ACTUAL, null);
  if (actual && actual.campos) {
    aplicarEstado(actual);
  } else {
    aplicarTipo();
    renderFormItems();
    renderFormCondiciones();
    render();
  }
  actualizarContadorAnteriores();
  actualizarBotonesImagenes();
})();
