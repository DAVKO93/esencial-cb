import { useState, useEffect, useRef } from 'react'
import { db, auth } from './firebase'
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'firebase/auth'

const G = `
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'DM Sans',sans-serif;background:#f7f7f7;color:#0d0d0d;min-height:100vh;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#f4f4f4;}
  ::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes tin{from{opacity:0;transform:translateX(30px);}to{opacity:1;transform:translateX(0);}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
`

let toastFn = null
function Toast() {
  const [toasts, setToasts] = useState([])
  toastFn = (type, msg) => {
    const id = Date.now()
    setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }
  return (
    <div style={{ position:'fixed', bottom:80, right:16, zIndex:3000, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background:'#fff', border:'1px solid #e0e0e0', borderRadius:9, padding:'11px 16px',
          minWidth:240, display:'flex', alignItems:'center', gap:10,
          boxShadow:'0 8px 24px rgba(0,0,0,0.11)', animation:'tin 0.3s ease',
          borderLeft: t.type==='ok'?'4px solid #4caf50':t.type==='warn'?'4px solid #ff9800':'4px solid #f44336'
        }}>
          <span style={{fontSize:11,fontWeight:700}}>{t.type==='ok'?'OK':t.type==='warn'?'!':'X'}</span>
          <span style={{fontSize:12,color:'#0d0d0d'}}>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
const showToast = (type, msg) => toastFn && toastFn(type, msg)

function Spinner() {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:65,flexDirection:'column',gap:13}}>
      <div style={{width:32,height:32,border:'2px solid #d0d0d0',borderTopColor:'#1a1a1a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <p style={{color:'#999',fontSize:12}}>Cargando...</p>
    </div>
  )
}

function Btn({ children, onClick, disabled, variant='primary', style={} }) {
  const base = {
    padding:'11px 20px', borderRadius:9, fontFamily:'DM Sans,sans-serif',
    fontSize:12, fontWeight:600, letterSpacing:1, textTransform:'uppercase',
    cursor: disabled?'not-allowed':'pointer', border:'none', transition:'all 0.2s', ...style
  }
  const variants = {
    primary: { background: disabled?'#e8e8e8':'#1a1a1a', color: disabled?'#999':'#fff' },
    danger:  { background:'#c62828', color:'#fff' },
    sec:     { background:'#fff', color:'#666', border:'1.5px solid #d0d0d0' }
  }
  return <button style={{...base,...variants[variant]}} onClick={onClick} disabled={disabled}>{children}</button>
}

function Input({ label, type='text', value, onChange, placeholder, readonly }) {
  return (
    <div style={{marginBottom:13}}>
      {label && <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} readOnly={readonly}
        style={{width:'100%',background:readonly?'#f4f4f4':'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:readonly?'#666':'#1a1a1a',
          fontFamily:'DM Sans,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{marginBottom:13}}>
      {label && <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:'#1a1a1a',
          fontFamily:'DM Sans,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',cursor:'pointer'}}>
        <option value=''>Seleccionar...</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Modal({ open, onClose, title, sub, icon, children, footer }) {
  if (!open) return null
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.46)',backdropFilter:'blur(5px)',
        zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:16,width:'92%',maxWidth:460,
        overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.18)',animation:'fadeIn 0.25s ease'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #e0e0e0',display:'flex',alignItems:'center',gap:13,background:'#f4f4f4'}}>
          {icon && <div style={{width:38,height:38,background:'#1a1a1a',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:13}}>{icon}</div>}
          <div style={{flex:1}}>
            <div style={{fontFamily:'Playfair Display,serif',fontSize:17,color:'#1a1a1a'}}>{title}</div>
            {sub && <div style={{fontSize:11,color:'#999',marginTop:2}}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#999',padding:'0 4px'}}>×</button>
        </div>
        <div style={{padding:'18px 20px',maxHeight:'65vh',overflowY:'auto'}}>{children}</div>
        {footer && <div style={{padding:'12px 20px',borderTop:'1px solid #e0e0e0',display:'flex',gap:8,justifyContent:'flex-end',background:'#f4f4f4'}}>{footer}</div>}
      </div>
    </div>
  )
}

// ==========================================
// LOGIN
// ==========================================
function Login() {
  const [tab, setTab] = useState('ingresar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [nombre, setNombre] = useState('')
  const [passReg, setPassReg] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  async function doLogin() {
    if (!email || !pass) { setMsg({ type:'err', txt:'Completa todos los campos' }); return }
    setLoading(true); setMsg(null)
    try {
      await signInWithEmailAndPassword(auth, email, pass)
    } catch(e) {
      setMsg({ type:'err', txt:'Correo o contraseña incorrectos' })
    }
    setLoading(false)
  }

  async function doRegistro() {
    if (!nombre || !email || !passReg) { setMsg({ type:'err', txt:'Completa todos los campos' }); return }
    if (passReg.length < 6) { setMsg({ type:'err', txt:'Minimo 6 caracteres' }); return }
    setLoading(true); setMsg(null)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, passReg)
      await addDoc(collection(db, 'usuarios'), {
        uid: cred.user.uid, nombre, email, estado: 'PENDIENTE', creadoEn: serverTimestamp()
      })
      setMsg({ type:'ok', txt:'Solicitud enviada. Espera aprobacion.' })
    } catch(e) {
      setMsg({ type:'err', txt: e.code==='auth/email-already-in-use'?'Correo ya registrado':'Error al crear cuenta' })
    }
    setLoading(false)
  }

  const tabStyle = (t) => ({
    flex:1, padding:10, fontSize:11, fontWeight:600, letterSpacing:1, textTransform:'uppercase',
    textAlign:'center', cursor:'pointer', transition:'all 0.2s',
    background: tab===t?'#1a1a1a':'#f4f4f4', color: tab===t?'#fff':'#999', border:'none'
  })

  return (
    <div style={{position:'fixed',inset:0,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:20,overflowY:'auto'}}>
      <div style={{width:'100%',maxWidth:420}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <img src='/logo.png' alt='Logo' style={{height:60,objectFit:'contain',marginBottom:12}} />
          <h1 style={{fontFamily:'Playfair Display,serif',fontSize:28,fontWeight:700,color:'#1a1a1a',letterSpacing:2}}>Esencial FC</h1>
          
          <div style={{width:40,height:2,background:'#1a1a1a',margin:'14px auto 0'}}/>
        </div>
        <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:16,overflow:'hidden',boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>
          <div style={{display:'flex',borderBottom:'1px solid #e0e0e0'}}>
            <button style={tabStyle('ingresar')} onClick={()=>{setTab('ingresar');setMsg(null)}}>Ingresar</button>
            <button style={tabStyle('registro')} onClick={()=>{setTab('registro');setMsg(null)}}>Crear Cuenta</button>
          </div>
          <div style={{padding:24}}>
            {tab==='ingresar' ? (
              <>
                <h2 style={{fontFamily:'Playfair Display,serif',fontSize:20,marginBottom:5}}>Bienvenido</h2>
                <p style={{fontSize:12,color:'#999',marginBottom:20}}>Ingresa tus credenciales</p>
                <Input label='Correo' type='email' value={email} onChange={setEmail} placeholder='correo@ejemplo.com'/>
                <Input label='Contrasena' type='password' value={pass} onChange={setPass} placeholder='••••••••'/>
                <Btn onClick={doLogin} disabled={loading} style={{width:'100%',marginTop:4}}>
                  {loading?'Ingresando...':'Ingresar'}
                </Btn>
              </>
            ) : (
              <>
                <h2 style={{fontFamily:'Playfair Display,serif',fontSize:20,marginBottom:5}}>Crear Cuenta</h2>
                <p style={{fontSize:12,color:'#999',marginBottom:20}}>El admin aprobara tu acceso</p>
                <Input label='Nombre completo *' value={nombre} onChange={setNombre} placeholder='Tu nombre'/>
                <Input label='Correo *' type='email' value={email} onChange={setEmail} placeholder='correo@ejemplo.com'/>
                <Input label='Contrasena * (min 6)' type='password' value={passReg} onChange={setPassReg} placeholder='••••••••'/>
                <Btn onClick={doRegistro} disabled={loading} style={{width:'100%',marginTop:4}}>
                  {loading?'Enviando...':'Enviar Solicitud'}
                </Btn>
              </>
            )}
            {msg && (
              <div style={{marginTop:12,padding:'10px 14px',borderRadius:8,fontSize:12,textAlign:'center',
                background:msg.type==='ok'?'#e8f5e9':'#ffebee',
                color:msg.type==='ok'?'#2e7d32':'#c62828',
                border:`1px solid ${msg.type==='ok'?'#a5d6a7':'#ef9a9a'}`}}>
                {msg.txt}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// FORMULARIO PRODUCTO (agregar / editar)
// ==========================================
function FormProducto({ item, onClose, onSave }) {
  const cats = ['Congelados','Dulce','Mixtos','Bebidas','Combos','Acompanantes','Otros']
  const [nombre, setNombre] = useState(item?.nombre||'')
  const [descripcion, setDescripcion] = useState(item?.descripcion||'')
  const [precio, setPrecio] = useState(item?.precio||'')
  const [categoria, setCategoria] = useState(item?.categoria||'')
  const [imagen, setImagen] = useState(item?.imagen||'')
  const [disponible, setDisponible] = useState(item?.disponible!==false)
  const [loading, setLoading] = useState(false)

  async function guardar() {
    if (!nombre || !precio || !categoria) { showToast('err','Nombre, precio y categoria son obligatorios'); return }
    setLoading(true)
    const datos = { nombre, descripcion, precio: parseFloat(precio), categoria, imagen, disponible }
    try {
      if (item?.id) {
        await updateDoc(doc(db,'menu',item.id), datos)
        showToast('ok','Producto actualizado')
      } else {
        await addDoc(collection(db,'menu'), datos)
        showToast('ok','Producto agregado al menu')
      }
      onSave()
    } catch(e) { showToast('err','Error al guardar') }
    setLoading(false)
  }

  async function eliminarProducto() {
    if (!item?.id) return
    setLoading(true)
    try {
      await deleteDoc(doc(db,'menu',item.id))
      showToast('ok','Producto eliminado')
      onSave()
    } catch(e) { showToast('err','Error al eliminar') }
    setLoading(false)
  }

  return (
    <>
      <Input label='Nombre *' value={nombre} onChange={setNombre} placeholder='Ej: Hamburguesa'/>
      <Input label='Descripcion' value={descripcion} onChange={setDescripcion} placeholder='Ingredientes o detalles'/>
      <Input label='Precio *' type='number' value={precio} onChange={setPrecio} placeholder='0.00'/>
      <Select label='Categoria *' value={categoria} onChange={setCategoria} options={cats}/>
      <Input label='Imagen (URL)' value={imagen} onChange={setImagen} placeholder='https://...'/>
      {imagen ? <img src={imagen} alt='preview' style={{width:'100%',height:100,objectFit:'contain',borderRadius:8,marginBottom:13,border:'1px solid #e0e0e0'}}/> : null}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,padding:'10px 13px',background:'#f4f4f4',borderRadius:8,border:'1px solid #e0e0e0'}}>
        <span style={{fontSize:12,fontWeight:600,color:'#666'}}>Disponible en menu</span>
        <button onClick={()=>setDisponible(!disponible)} style={{
          width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',transition:'0.2s',
          background:disponible?'#1a1a1a':'#ccc',position:'relative'
        }}>
          <div style={{position:'absolute',top:2,left:disponible?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'0.2s'}}/>
        </button>
      </div>
      <div style={{display:'flex',gap:8,flexDirection:'column'}}>
        <Btn onClick={guardar} disabled={loading} style={{width:'100%'}}>
          {loading?'Guardando...':(item?.id?'Guardar Cambios':'Agregar Producto')}
        </Btn>
        {item?.id && (
          <Btn onClick={eliminarProducto} disabled={loading} variant='danger' style={{width:'100%'}}>
            Eliminar Producto
          </Btn>
        )}
      </div>
    </>
  )
}

// ==========================================
// APP PRINCIPAL
// ==========================================
export default function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [aprobado, setAprobado] = useState(false)
  const [tab, setTab] = useState('menu')
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [catActiva, setCatActiva] = useState('Todos')
  const [tipoCliente, setTipoCliente] = useState('cliente')
  const [pedidosActivos, setPedidosActivos] = useState([])
  const [pagoSel, setPagoSel] = useState({})
  const [modalEliminar, setModalEliminar] = useState(null)
  const [modalConfirm, setModalConfirm] = useState(null)
  const [modalProducto, setModalProducto] = useState(null) // null | 'nuevo' | {item}
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendientesSync, setPendientesSync] = useState([])
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [nombreEmpleado, setNombreEmpleado] = useState('')
  // Comprobante camara
  const [fotoComprobante, setFotoComprobante] = useState({}) // {pedidoId: dataURL}
  const cameraRefs = useRef({})

  // Form cliente
  const [cId, setCId] = useState('')
  const [cNombre, setCNombre] = useState('')
  const [cTel, setCTel] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cMesa, setCMesa] = useState('')
  const [cNotas, setCNotas] = useState('')
  const [fId, setFId] = useState('')
  const [fMesa, setFMesa] = useState('')
  const [fNotas, setFNotas] = useState('')

  // Filtros historial
  const hoy = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()
  const [fDesde, setFDesde] = useState(hoy)
  const [fHasta, setFHasta] = useState(hoy)
  const [busqueda, setBusqueda] = useState('')
  const [periodoActivo, setPeriodoActivo] = useState('hoy')

  // ---- AUTH ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setAuthReady(true)
      if (u) {
        const q = query(collection(db,'usuarios'), where('uid','==',u.uid))
        const snap = await getDocs(q)
        if (!snap.empty) {
          const userData = snap.docs[0].data()
          setAprobado(userData.estado === 'APROBADO')
          setNombreEmpleado(userData.nombre || u.email)
        } else {
          setAprobado(true)
          setNombreEmpleado(u.email)
        }
      }
    })
    return unsub
  }, [])

  // ---- ONLINE/OFFLINE ----
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); showToast('ok','Conexion restaurada'); sincronizarPendientes() }
    const onOffline = () => { setIsOnline(false); showToast('warn','Sin conexion - Modo offline') }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online',onOnline); window.removeEventListener('offline',onOffline) }
  }, [])

  // ---- PWA INSTALL ----
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function instalarApp() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then(r => {
      if (r.outcome==='accepted') showToast('ok','App instalada')
      setDeferredPrompt(null); setShowInstall(false)
    })
  }

  // ---- PENDIENTES OFFLINE ----
  function getPendientes() { try { return JSON.parse(localStorage.getItem('esencial_pendientes')||'[]') } catch(e){ return [] } }
  function setPendientesLS(arr) { localStorage.setItem('esencial_pendientes',JSON.stringify(arr)); setPendientesSync(arr) }

  async function sincronizarPendientes() {
    const pend = getPendientes()
    if (!pend.length) return
    const exitos = []
    for (const p of pend) {
      try {
        await addDoc(collection(db,'pedidos'), { ...p, sincronizado: true, sincronizadoEn: serverTimestamp() })
        exitos.push(p._idLocal)
      } catch(e) {}
    }
    setPendientesLS(pend.filter(p => !exitos.includes(p._idLocal)))
    if (exitos.length) showToast('ok', `${exitos.length} pedido(s) sincronizados`)
  }

  useEffect(() => { setPendientesSync(getPendientes()) }, [])

  // ---- MENU (tiempo real) ----
  useEffect(() => {
    if (!user || !aprobado) return
    setLoadingMenu(true)
    const q = query(collection(db,'menu'), where('disponible','==',true))
    const unsub = onSnapshot(q, (snap) => {
      setMenuItems(snap.docs.map(d => ({ id:d.id, ...d.data() })))
      setLoadingMenu(false)
    }, () => setLoadingMenu(false))
    return unsub
  }, [user, aprobado])

  // ---- PEDIDOS EN PROCESO (tiempo real) ----
  useEffect(() => {
    if (!user || !aprobado || tab !== 'proceso') return
    const q = query(collection(db,'pedidos'), where('estado','==','EN PROCESO'), orderBy('creadoEn','desc'))
    const unsub = onSnapshot(q, (snap) => {
      setPedidosActivos(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
    return unsub
  }, [user, aprobado, tab])

  // ---- CARRITO ----
  function addToCart(item) {
    setCart(prev => {
      const found = prev.find(x => x.id === item.id)
      if (found) return prev.map(x => x.id===item.id ? {...x,cantidad:x.cantidad+1} : x)
      return [...prev, { ...item, cantidad:1 }]
    })
    showToast('ok', item.nombre + ' agregado')
  }

  function updateQty(id, delta) {
    setCart(prev => prev.map(x => x.id===id ? {...x,cantidad:x.cantidad+delta} : x).filter(x => x.cantidad > 0))
  }

  const cartTotal = cart.reduce((s,x) => s + x.precio*x.cantidad, 0)
  const cartCount = cart.reduce((s,x) => s + x.cantidad, 0)

  // ---- CREAR PEDIDO ----
  async function confirmarPedido() {
    let datos = {}
    if (tipoCliente === 'cliente') {
      if (!cNombre) { showToast('err','Ingresa el nombre del cliente'); return }
      if (!cMesa) { showToast('err','Selecciona mesa o servicio'); return }
      datos = { tipoCliente:'Cliente', idDocumento:cId, cliente:cNombre, telefono:cTel, email:cEmail, mesa:cMesa, notas:cNotas }
    } else {
      if (!fMesa) { showToast('err','Selecciona mesa o servicio'); return }
      datos = { tipoCliente:'Consumidor Final', idDocumento:fId||'9999999999999', cliente:'Consumidor Final', telefono:'', email:'', mesa:fMesa, notas:fNotas }
    }
    const items = cart.map(x => ({ id:x.id, nombre:x.nombre, precio:x.precio, cantidad:x.cantidad }))
    const total = cartTotal
    const pedido = { ...datos, items, total, estado:'EN PROCESO', empleado: nombreEmpleado, creadoEn: serverTimestamp() }

    if (!isOnline) {
      const idLocal = 'LOCAL-' + Date.now()
      const pend = getPendientes()
      pend.push({ ...pedido, _idLocal:idLocal, creadoEn: new Date().toISOString() })
      setPendientesLS(pend)
      setModalConfirm({ idPedido: idLocal, offline:true, datos:{ ...datos, items, total } })
      setCart([]); limpiarForm(); return
    }

    try {
      const ref = await addDoc(collection(db,'pedidos'), pedido)
      setModalConfirm({ idPedido: ref.id, offline:false, datos:{ ...datos, items, total } })
      setCart([]); limpiarForm()
    } catch(e) {
      const idLocal = 'LOCAL-' + Date.now()
      const pend = getPendientes()
      pend.push({ ...pedido, _idLocal:idLocal, creadoEn: new Date().toISOString() })
      setPendientesLS(pend)
      setModalConfirm({ idPedido: idLocal, offline:true, datos:{ ...datos, items, total } })
      setCart([]); limpiarForm()
      showToast('warn','Guardado offline.')
    }
  }

  function limpiarForm() {
    setCId(''); setCNombre(''); setCTel(''); setCEmail(''); setCMesa(''); setCNotas('')
    setFId(''); setFMesa(''); setFNotas('')
  }

  // ---- MARCAR LISTO ----
  async function marcarListo(id) {
    if (!pagoSel[id]) { showToast('err','Selecciona forma de pago'); return }
    try {
      await updateDoc(doc(db,'pedidos',id), { estado:'LISTO', formaPago: pagoSel[id] })
      showToast('ok','Pedido marcado como listo')
      setPagoSel(p => { const n={...p}; delete n[id]; return n })
      setFotoComprobante(p => { const n={...p}; delete n[id]; return n })
    } catch(e) { showToast('err','Error al actualizar') }
  }

  // ---- ELIMINAR ----
  async function eliminarPedido() {
    if (!modalEliminar) return
    const idEliminar = modalEliminar
    setModalEliminar(null)
    // Quitar inmediatamente de la UI
    setPedidosActivos(p => p.filter(x => x.id !== idEliminar))
    setHistorial(p => p.filter(x => x.id !== idEliminar))
    try {
      await deleteDoc(doc(db,'pedidos', idEliminar))
      showToast('ok','Pedido eliminado')
    } catch(e) {
      showToast('err','Error al eliminar')
      // Si falla, recargar pedidos
      setPedidosActivos(p => p)
    }
  }

  // ---- CAMARA COMPROBANTE ----
  function abrirCamara(pedidoId) {
    if (cameraRefs.current[pedidoId]) cameraRefs.current[pedidoId].click()
  }

  function onFotoCapturada(pedidoId, e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setFotoComprobante(p => ({...p, [pedidoId]: ev.target.result}))
    reader.readAsDataURL(file)
  }

  async function compartirComprobante(pedidoId) {
    const foto = fotoComprobante[pedidoId]
    if (!foto) return
    try {
      const res = await fetch(foto)
      const blob = await res.blob()
      const file = new File([blob], 'comprobante.jpg', { type:'image/jpeg' })
      if (navigator.share && navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:'Comprobante de pago' })
      } else {
        const a = document.createElement('a')
        a.href = foto
        a.download = 'comprobante.jpg'
        a.click()
        showToast('warn','Compartir no disponible — imagen descargada')
      }
    } catch(e) {}
  }

  // ---- HISTORIAL ----
  async function loadHistorial(desde, hasta) {
    setLoadingHist(true)
    try {
      const snap = await getDocs(query(collection(db,'pedidos'), orderBy('creadoEn','desc')))
      let pedidos = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      const d = desde || fDesde
      const h = hasta || fHasta
      if (d && h) {
        pedidos = pedidos.filter(p => {
          if (!p.creadoEn) return false
          const f = p.creadoEn.toDate ? p.creadoEn.toDate() : new Date(p.creadoEn)
          const fechaLocal = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`
          return fechaLocal >= d && fechaLocal <= h
        })
      }
      setHistorial(pedidos)
    } catch(e) { showToast('err','Error al cargar historial') }
    setLoadingHist(false)
  }

  function getFecha(offsetDias) {
    const d = new Date()
    d.setDate(d.getDate() + offsetDias)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function getLunesSemana(offset=0) {
    const d = new Date(); const dia = d.getDay() || 7
    d.setDate(d.getDate() - dia + 1 + offset*7)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function getDomingoSemana(offset=0) {
    const d = new Date(); const dia = d.getDay() || 7
    d.setDate(d.getDate() - dia + 7 + offset*7)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function getPrimerDiaMes() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  }

  function aplicarPeriodo(periodo) {
    setPeriodoActivo(periodo); setBusqueda('')
    let desde, hasta
    const hoyStr = getFecha(0)
    if (periodo==='hoy') { desde=hoyStr; hasta=hoyStr }
    else if (periodo==='ayer') { desde=getFecha(-1); hasta=getFecha(-1) }
    else if (periodo==='semana') { desde=getLunesSemana(0); hasta=getDomingoSemana(0) }
    else if (periodo==='semana_ant') { desde=getLunesSemana(-1); hasta=getDomingoSemana(-1) }
    else if (periodo==='mes') { desde=getPrimerDiaMes(); hasta=hoyStr }
    setFDesde(desde); setFHasta(hasta)
    loadHistorial(desde, hasta)
  }

  useEffect(() => { if (tab==='historial' && user && aprobado) aplicarPeriodo('hoy') }, [tab])

  // ---- CATEGORIAS ----
  const cats = ['Todos', ...new Set(menuItems.map(x=>x.categoria))]
  const menuFiltrado = catActiva==='Todos' ? menuItems : menuItems.filter(x=>x.categoria===catActiva)

  // ---- RENDER ----
  if (!authReady) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
      <div style={{width:32,height:32,border:'2px solid #d0d0d0',borderTopColor:'#1a1a1a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    </div>
  )

  if (!user) return <><style>{G}</style><Login/><Toast/></>

  if (!aprobado) return (
    <>
      <style>{G}</style>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16,padding:20,textAlign:'center'}}>
        <img src='/logo.png' alt='Logo' style={{height:60,objectFit:'contain'}}/>
        <h2 style={{fontFamily:'Playfair Display,serif',fontSize:22}}>Cuenta Pendiente</h2>
        <p style={{color:'#999',fontSize:13,maxWidth:320}}>Tu solicitud está siendo revisada.</p>
        <Btn onClick={()=>signOut(auth)} variant='sec'>Cerrar Sesion</Btn>
      </div>
      <Toast/>
    </>
  )

  const mesaOpts = ['Mesa 1','Mesa 2','Mesa 3','Mesa 4','Mesa 5','A Domicilio']

  // Iconos nav
  const navItems = [
    { key:'menu', label:'Menu' },
    { key:'pedido', label:'Pedido', badge: cartCount },
    { key:'proceso', label:'En Proceso', badge: pedidosActivos.length+pendientesSync.length },
    { key:'historial', label:'Historial' },
  ]

  return (
    <>
      <style>{G}</style>

      {/* OFFLINE BANNER */}
      {!isOnline && (
        <div style={{background:'#b8860b',color:'#fff',textAlign:'center',padding:'8px 16px',fontSize:11,fontWeight:600,position:'fixed',top:0,left:0,right:0,zIndex:9999}}>
          Sin conexion — Modo offline activo
        </div>
      )}

      {/* HEADER */}
      <header style={{background:'#1a1a1a',padding:'0 16px',position:'sticky',top:isOnline?0:34,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'space-between',height:54}}>
        <div>
          <h1 style={{fontFamily:'Playfair Display,serif',fontSize:16,fontWeight:700,color:'#fff',letterSpacing:2}}>Esencial FC</h1>
          
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {showInstall && (
            <button onClick={instalarApp} style={{background:'#fff',border:'none',color:'#1a1a1a',padding:'6px 11px',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:10,fontWeight:600,cursor:'pointer'}}>
              Instalar App
            </button>
          )}
          {pendientesSync.length > 0 && (
            <span style={{background:'#b8860b',color:'#fff',borderRadius:100,padding:'2px 8px',fontSize:9,fontWeight:700}}>
              {pendientesSync.length} pendiente{pendientesSync.length>1?'s':''}
            </span>
          )}
          <button onClick={()=>signOut(auth)} style={{background:'none',border:'1px solid #555',color:'#ccc',padding:'5px 10px',borderRadius:6,cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:10}}>
            Salir
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main style={{maxWidth:900,margin:'0 auto',padding:'16px 12px 90px'}}>

        {/* ===== MENU ===== */}
        {tab==='menu' && (
          <div style={{animation:'fadeIn 0.3s ease'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,paddingBottom:12,borderBottom:'2px solid #e0e0e0'}}>
              <div>
                <h2 style={{fontFamily:'Playfair Display,serif',fontSize:22,fontWeight:600}}>Menu</h2>
                <p style={{fontSize:11,color:'#999',marginTop:2}}>{menuItems.length} productos</p>
              </div>
              <button onClick={()=>setModalProducto('nuevo')} style={{
                background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,padding:'10px 16px',
                fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',
                display:'flex',alignItems:'center',gap:6
              }}>
                <span style={{fontSize:18,fontWeight:300}}>+</span> Agregar
              </button>
            </div>

            {/* Categorias */}
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14}}>
              {cats.map(c => (
                <button key={c} onClick={()=>setCatActiva(c)} style={{
                  padding:'6px 14px',borderRadius:100,border:'2px solid',fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:500,cursor:'pointer',transition:'0.2s',
                  background:catActiva===c?'#1a1a1a':'#fff', color:catActiva===c?'#fff':'#666', borderColor:catActiva===c?'#1a1a1a':'#d0d0d0'
                }}>{c}</button>
              ))}
            </div>

            {/* LISTA DE PRODUCTOS */}
            {loadingMenu ? <Spinner/> : (
              <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                {!menuFiltrado.length ? (
                  <div style={{padding:40,textAlign:'center',color:'#999',fontSize:12}}>Sin productos en esta categoria</div>
                ) : menuFiltrado.map((item, idx) => (
                  <div key={item.id} style={{
                    display:'flex',alignItems:'center',gap:12,padding:'11px 14px',
                    borderBottom: idx<menuFiltrado.length-1?'1px solid #e0e0e0':'none',
                    transition:'background 0.15s'
                  }}>
                    {/* Imagen pequeña */}
                    <div style={{width:48,height:48,borderRadius:8,overflow:'hidden',flexShrink:0,background:'#f4f4f4',border:'1px solid #e0e0e0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {item.imagen
                        ? <img src={item.imagen} alt={item.nombre} style={{width:'100%',height:'100%',objectFit:'contain'}}/>
                        : <span style={{fontSize:10,fontWeight:700,color:'#999'}}>{item.categoria?.slice(0,2).toUpperCase()}</span>
                      }
                    </div>
                    {/* Info — click para editar */}
                    <div style={{flex:1,cursor:'pointer'}} onClick={()=>setModalProducto(item)}>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{item.nombre}</div>
                      <div style={{fontSize:11,color:'#999',marginTop:1}}>{item.descripcion}</div>
                      <span style={{display:'inline-block',marginTop:4,background:'#1a1a1a',color:'#fff',fontSize:9,fontWeight:700,letterSpacing:1,textTransform:'uppercase',padding:'2px 7px',borderRadius:100}}>{item.categoria}</span>
                    </div>
                    {/* Precio */}
                    <div style={{fontFamily:'Playfair Display,serif',fontSize:16,color:'#1a1a1a',minWidth:50,textAlign:'right'}}>
                      ${parseFloat(item.precio).toFixed(2)}
                    </div>
                    {/* Boton + */}
                    <button onClick={()=>addToCart(item)} style={{
                      width:36,height:36,borderRadius:'50%',background:'#1a1a1a',color:'#fff',
                      border:'none',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,fontWeight:300
                    }}>+</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== MI PEDIDO ===== */}
        {tab==='pedido' && (
          <div style={{animation:'fadeIn 0.3s ease'}}>
            <div style={{marginBottom:16,paddingBottom:12,borderBottom:'2px solid #e0e0e0'}}>
              <h2 style={{fontFamily:'Playfair Display,serif',fontSize:22,fontWeight:600}}>Mi Pedido</h2>
              <p style={{fontSize:11,color:'#999',marginTop:2}}>Revisa y confirma</p>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {/* Carrito */}
              <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid #e0e0e0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f4f4f4'}}>
                  <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#666',fontWeight:600}}>Productos</span>
                  <button onClick={()=>setCart([])} style={{background:'none',border:'1px solid #e0e0e0',color:'#666',fontSize:11,cursor:'pointer',fontFamily:'DM Sans,sans-serif',padding:'3px 9px',borderRadius:6}}>Limpiar</button>
                </div>
                {!cart.length ? (
                  <div style={{padding:36,textAlign:'center',color:'#999',fontSize:12}}>Pedido vacío. Ve al menú y agrega productos.</div>
                ) : cart.map(it => (
                  <div key={it.id} style={{padding:'10px 16px',borderBottom:'1px solid #e0e0e0',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500}}>{it.nombre}</div>
                      <div style={{fontSize:11,color:'#999',marginTop:1}}>${parseFloat(it.precio).toFixed(2)} c/u</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <button onClick={()=>updateQty(it.id,-1)} style={{width:26,height:26,borderRadius:'50%',border:'1px solid #d0d0d0',background:'#fff',cursor:'pointer',fontSize:16}}>-</button>
                      <span style={{fontSize:13,fontWeight:600,minWidth:18,textAlign:'center'}}>{it.cantidad}</span>
                      <button onClick={()=>updateQty(it.id,1)} style={{width:26,height:26,borderRadius:'50%',border:'1px solid #d0d0d0',background:'#fff',cursor:'pointer',fontSize:16}}>+</button>
                    </div>
                    <div style={{fontSize:13,fontWeight:600,minWidth:46,textAlign:'right'}}>${(it.precio*it.cantidad).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Formulario */}
              <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                <div style={{display:'flex',borderBottom:'1px solid #e0e0e0'}}>
                  {['cliente','final'].map(t => (
                    <button key={t} onClick={()=>setTipoCliente(t)} style={{
                      flex:1,padding:'11px 7px',fontSize:10,fontWeight:600,letterSpacing:1,textTransform:'uppercase',
                      color:tipoCliente===t?'#1a1a1a':'#999',cursor:'pointer',border:'none',
                      borderBottom:tipoCliente===t?'3px solid #1a1a1a':'3px solid transparent',
                      background:tipoCliente===t?'#fff':'#f4f4f4',transition:'0.2s'
                    }}>{t==='cliente'?'Cliente':'Cons. Final'}</button>
                  ))}
                </div>
                <div style={{padding:'14px 16px'}}>
                  {tipoCliente==='cliente' ? (
                    <>
                      <Input label='ID / Documento' value={cId} onChange={setCId} placeholder='Cedula o RUC'/>
                      <Input label='Nombre *' value={cNombre} onChange={setCNombre} placeholder='Nombre completo'/>
                      <Input label='Telefono' type='tel' value={cTel} onChange={setCTel} placeholder='09XXXXXXXX'/>
                      <Input label='Correo' type='email' value={cEmail} onChange={setCEmail} placeholder='correo@ejemplo.com'/>
                      <Select label='Mesa / Servicio *' value={cMesa} onChange={setCMesa} options={mesaOpts}/>
                      <div style={{marginBottom:13}}>
                        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Notas</label>
                        <textarea value={cNotas} onChange={e=>setCNotas(e.target.value)} placeholder='Sin cebolla...'
                          style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:'#1a1a1a',fontFamily:'DM Sans,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',minHeight:50,resize:'vertical'}}/>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input label='ID / Documento' value={fId} onChange={setFId} placeholder='9999999999999'/>
                      <Select label='Mesa / Servicio *' value={fMesa} onChange={setFMesa} options={mesaOpts}/>
                      <div style={{marginBottom:13}}>
                        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Notas</label>
                        <textarea value={fNotas} onChange={e=>setFNotas(e.target.value)} placeholder='Sin cebolla...'
                          style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:'#1a1a1a',fontFamily:'DM Sans,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',minHeight:50,resize:'vertical'}}/>
                      </div>
                    </>
                  )}
                </div>
                {!isOnline && (
                  <div style={{margin:'0 16px 12px',padding:'9px 13px',background:'#fff8e1',border:'1px solid #e8d88a',borderRadius:8,fontSize:11,color:'#b8860b',fontWeight:600}}>
                    Sin internet — Pedido se guardará localmente
                  </div>
                )}
                <div style={{margin:'0 16px 12px',padding:12,background:'#f4f4f4',borderRadius:9,border:'1px solid #e0e0e0'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#999',marginBottom:6}}><span>Subtotal</span><span>${cartTotal.toFixed(2)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0'}}>
                    <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#666',fontWeight:600}}>Total</span>
                    <span style={{fontFamily:'Playfair Display,serif',fontSize:22}}>${cartTotal.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{padding:'0 16px 16px'}}>
                  <Btn onClick={confirmarPedido} disabled={!cart.length} style={{width:'100%'}}>Confirmar Pedido</Btn>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== EN PROCESO ===== */}
        {tab==='proceso' && (
          <div style={{animation:'fadeIn 0.3s ease'}}>
            <div style={{marginBottom:16,paddingBottom:12,borderBottom:'2px solid #e0e0e0'}}>
              <h2 style={{fontFamily:'Playfair Display,serif',fontSize:22,fontWeight:600}}>En Proceso</h2>
              <p style={{fontSize:11,color:'#999',marginTop:2}}>Tiempo real</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:13}}>
              {/* Pendientes offline */}
              {pendientesSync.map(p => (
                <div key={p._idLocal} style={{background:'#fffdf5',border:'1px solid #e8d88a',borderRadius:13,overflow:'hidden'}}>
                  <div style={{background:'#fff8e1',padding:'11px 15px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #e8d88a'}}>
                    <div style={{fontFamily:'Playfair Display,serif',fontSize:13}}>LOCAL</div>
                    <span style={{background:'#fff8e1',color:'#b8860b',border:'1px solid #e8d88a',padding:'2px 7px',borderRadius:100,fontSize:9,fontWeight:700}}>OFFLINE</span>
                  </div>
                  <div style={{padding:'12px 15px'}}>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:7}}>{p.cliente}</div>
                    {p.items?.map((it,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'3px 0',borderBottom:'1px solid #e0e0e0'}}><span>{it.cantidad}x {it.nombre}</span><span>${(it.precio*it.cantidad).toFixed(2)}</span></div>)}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0',marginTop:7}}>
                      <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600}}>Total</span>
                      <span style={{fontFamily:'Playfair Display,serif',fontSize:17}}>${parseFloat(p.total).toFixed(2)}</span>
                    </div>
                    <div style={{marginTop:9,fontSize:11,color:'#b8860b',fontWeight:600}}>Se enviará al reconectar</div>
                  </div>
                </div>
              ))}

              {/* Pedidos online */}
              {pedidosActivos.map(p => (
                <div key={p.id} style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                  <div style={{background:'#f4f4f4',padding:'11px 15px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #e0e0e0'}}>
                    <div>
                      <div style={{fontFamily:'Playfair Display,serif',fontSize:13}}>{p.id.slice(0,8)}...</div>
                      <div style={{fontSize:10,color:'#999',marginTop:1}}>{p.creadoEn?.toDate?.()?.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})||''}</div>
                    </div>
                    <span style={{background:'#fff8e1',color:'#b8860b',border:'1px solid #e8d88a',padding:'3px 8px',borderRadius:100,fontSize:9,fontWeight:700}}>EN PROCESO</span>
                  </div>
                  <div style={{padding:'12px 15px'}}>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{p.cliente}</div>
                    {p.mesa && <div style={{fontSize:11,color:'#666',marginBottom:2,fontWeight:600}}>{p.mesa}</div>}
                    {p.telefono && <div style={{fontSize:11,color:'#999',marginBottom:9}}>{p.telefono}</div>}
                    {p.empleado && <div style={{fontSize:10,color:'#888',marginBottom:9,padding:'3px 8px',background:'#f4f4f4',borderRadius:5,display:'inline-block'}}>Tomado por: <strong>{p.empleado}</strong></div>}
                    {p.items?.map((it,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'3px 0',borderBottom:'1px solid #e0e0e0'}}><span>{it.cantidad}x {it.nombre}</span><span>${(it.precio*it.cantidad).toFixed(2)}</span></div>)}
                    {p.notas && <div style={{fontSize:11,color:'#666',background:'#fffdf0',border:'1px solid #e8e4c0',padding:'5px 9px',borderRadius:6,marginTop:7}}>Nota: {p.notas}</div>}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0',marginTop:7}}>
                      <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600}}>Total</span>
                      <span style={{fontFamily:'Playfair Display,serif',fontSize:17}}>${parseFloat(p.total).toFixed(2)}</span>
                    </div>

                    {/* PAGO */}
                    <div style={{display:'flex',gap:7,marginTop:10}}>
                      <button onClick={()=>setPagoSel(prev=>({...prev,[p.id]:'Efectivo'}))} style={{
                        flex:1,padding:'9px 6px',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',transition:'0.2s',
                        background:pagoSel[p.id]==='Efectivo'?'#1a472a':'#fff',
                        color:pagoSel[p.id]==='Efectivo'?'#fff':'#666',
                        border:`1.5px solid ${pagoSel[p.id]==='Efectivo'?'#1a472a':'#d0d0d0'}`
                      }}>Efectivo</button>
                      <button onClick={()=>setPagoSel(prev=>({...prev,[p.id]:'Transferencia'}))} style={{
                        flex:1,padding:'9px 6px',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',transition:'0.2s',
                        background:pagoSel[p.id]==='Transferencia'?'#1a2e47':'#fff',
                        color:pagoSel[p.id]==='Transferencia'?'#fff':'#666',
                        border:`1.5px solid ${pagoSel[p.id]==='Transferencia'?'#1a2e47':'#d0d0d0'}`
                      }}>Transferencia</button>
                    </div>

                    {/* CAMARA COMPROBANTE - solo si es Transferencia */}
                    {pagoSel[p.id]==='Transferencia' && (
                      <div style={{marginTop:9,padding:'10px 12px',background:'#f0f4ff',border:'1px solid #c5d0e8',borderRadius:8}}>
                        <div style={{fontSize:11,color:'#555',fontWeight:600,marginBottom:8}}>Comprobante de transferencia</div>
                        <input
                          type='file' accept='image/*' capture='environment'
                          style={{display:'none'}}
                          ref={el => cameraRefs.current[p.id] = el}
                          onChange={e=>onFotoCapturada(p.id, e)}
                        />
                        {fotoComprobante[p.id] ? (
                          <div>
                            <img src={fotoComprobante[p.id]} alt='comprobante' style={{width:'100%',borderRadius:7,marginBottom:8,border:'1px solid #c5d0e8',maxHeight:140,objectFit:'contain'}}/>
                            <div style={{display:'flex',gap:7}}>
                              <button onClick={()=>abrirCamara(p.id)} style={{flex:1,padding:'8px',background:'#fff',border:'1.5px solid #c5d0e8',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',color:'#555'}}>
                                Retomar
                              </button>
                              <button onClick={()=>compartirComprobante(p.id)} style={{flex:1,padding:'8px',background:'#25d366',border:'none',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',color:'#fff'}}>
                                Compartir WA
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={()=>abrirCamara(p.id)} style={{width:'100%',padding:'10px',background:'#fff',border:'1.5px dashed #c5d0e8',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                            📷 Tomar foto del comprobante
                          </button>
                        )}
                      </div>
                    )}

                    <button onClick={()=>marcarListo(p.id)} disabled={!pagoSel[p.id]}
                      style={{display:'block',width:'100%',marginTop:8,padding:10,background:pagoSel[p.id]?'#1a1a1a':'#e8e8e8',border:'none',color:pagoSel[p.id]?'#fff':'#999',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1.5,textTransform:'uppercase',cursor:pagoSel[p.id]?'pointer':'not-allowed'}}>
                      Marcar como Listo
                    </button>
                    <button onClick={()=>setModalEliminar(p.id)}
                      style={{display:'block',width:'100%',marginTop:7,padding:9,background:'#fff',border:'1.5px solid #ffcdd2',color:'#c62828',borderRadius:7,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}

              {!pedidosActivos.length && !pendientesSync.length && (
                <div style={{gridColumn:'1/-1',textAlign:'center',padding:50}}>
                  <div style={{fontFamily:'Playfair Display,serif',fontSize:18,marginBottom:6}}>Sin pedidos activos</div>
                  <p style={{color:'#999',fontSize:12}}>Los pedidos aparecen aquí en tiempo real</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== HISTORIAL ===== */}
        {tab==='historial' && (
          <div style={{animation:'fadeIn 0.3s ease'}}>
            <div style={{marginBottom:16,paddingBottom:12,borderBottom:'2px solid #e0e0e0'}}>
              <h2 style={{fontFamily:'Playfair Display,serif',fontSize:22,fontWeight:600}}>Historial</h2>
              <p style={{fontSize:11,color:'#999',marginTop:2}}>Pedidos de hoy por defecto</p>
            </div>

            {/* Botones periodo */}
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:13}}>
              {[
                {key:'hoy',label:'Hoy'},
                {key:'ayer',label:'Ayer'},
                {key:'semana',label:'Semana actual'},
                {key:'semana_ant',label:'Semana anterior'},
                {key:'mes',label:'Este mes'}
              ].map(p => (
                <button key={p.key} onClick={()=>aplicarPeriodo(p.key)} style={{
                  padding:'7px 14px',borderRadius:100,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',transition:'0.2s',border:'2px solid',
                  background:periodoActivo===p.key?'#1a1a1a':'#fff',
                  color:periodoActivo===p.key?'#fff':'#666',
                  borderColor:periodoActivo===p.key?'#1a1a1a':'#d0d0d0'
                }}>{p.label}</button>
              ))}
            </div>

            {/* Filtros */}
            <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,padding:'14px 16px',marginBottom:13,display:'flex',alignItems:'flex-end',gap:12,flexWrap:'wrap',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
              <div>
                <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Desde</label>
                <input type='date' value={fDesde} onChange={e=>{setFDesde(e.target.value);setPeriodoActivo('')}} style={{background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'DM Sans,sans-serif',fontSize:12,padding:'8px 11px',outline:'none'}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Hasta</label>
                <input type='date' value={fHasta} onChange={e=>{setFHasta(e.target.value);setPeriodoActivo('')}} style={{background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'DM Sans,sans-serif',fontSize:12,padding:'8px 11px',outline:'none'}}/>
              </div>
              <Btn onClick={()=>{setPeriodoActivo('');loadHistorial()}}>Filtrar</Btn>
              <div style={{flex:1,minWidth:160}}>
                <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Buscar</label>
                <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder='Nombre, ID o telefono...'
                  style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'DM Sans,sans-serif',fontSize:12,padding:'8px 11px',outline:'none'}}/>
              </div>
            </div>

            {loadingHist ? <Spinner/> : (() => {
              const term = busqueda.toLowerCase()
              const filtrados = busqueda ? historial.filter(p =>
                (p.cliente||'').toLowerCase().includes(term) ||
                (p.idDocumento||'').toLowerCase().includes(term) ||
                (p.telefono||'').toLowerCase().includes(term)
              ) : historial
              const totalSum = filtrados.reduce((s,p)=>s+parseFloat(p.total||0),0)
              return (
                <>
                  <div style={{background:'#1a1a1a',borderRadius:13,padding:'14px 20px',marginBottom:13,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                    <div>
                      <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#888',fontWeight:600}}>
                        {periodoActivo==='hoy'?'HOY':periodoActivo==='ayer'?'AYER':periodoActivo==='semana'?'SEMANA ACTUAL':periodoActivo==='semana_ant'?'SEMANA ANTERIOR':periodoActivo==='mes'?'ESTE MES':'PERÍODO SELECCIONADO'}
                      </div>
                      <div style={{fontSize:11,color:'#666',marginTop:2}}>{filtrados.length} pedido{filtrados.length!==1?'s':''}</div>
                    </div>
                    <div style={{fontFamily:'Playfair Display,serif',fontSize:30,color:'#fff'}}>${totalSum.toFixed(2)}</div>
                  </div>
                  <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',overflowX:'auto',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead>
                        <tr>
                          {['Hora','Cliente','Mesa','Productos','Total','Pago','Estado','Empleado','Accion'].map(h => (
                            <th key={h} style={{background:'#f4f4f4',padding:'10px 14px',textAlign:'left',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600,borderBottom:'1px solid #e0e0e0'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!filtrados.length ? (
                          <tr><td colSpan={8} style={{padding:40,textAlign:'center',color:'#999',fontSize:12}}>Sin registros en este período</td></tr>
                        ) : filtrados.map(p => (
                          <tr key={p.id} style={{borderBottom:'1px solid #e0e0e0'}}>
                            <td style={{padding:'10px 14px',fontSize:12,color:'#666'}}>{p.creadoEn?.toDate?.()?.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})||'—'}</td>
                            <td style={{padding:'10px 14px',fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{p.cliente}</td>
                            <td style={{padding:'10px 14px',fontSize:12,color:'#666'}}>{p.mesa||'—'}</td>
                            <td style={{padding:'10px 14px',fontSize:11,color:'#999',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.items?.map(it=>`${it.cantidad}x ${it.nombre}`).join(', ')}</td>
                            <td style={{padding:'10px 14px',fontFamily:'Playfair Display,serif',fontSize:14}}>${parseFloat(p.total||0).toFixed(2)}</td>
                            <td style={{padding:'10px 14px'}}>
                              {p.formaPago ? <span style={{background:p.formaPago==='Efectivo'?'#e8f5e9':'#e3f2fd',color:p.formaPago==='Efectivo'?'#2e7d32':'#1565c0',border:`1px solid ${p.formaPago==='Efectivo'?'#a5d6a7':'#90caf9'}`,padding:'3px 8px',borderRadius:100,fontSize:9,fontWeight:700}}>{p.formaPago}</span> : <span style={{color:'#ccc',fontSize:11}}>—</span>}
                            </td>
                            <td style={{padding:'10px 14px'}}>
                              <span style={{background:p.estado==='EN PROCESO'?'#fff8e1':'#e8f5e9',color:p.estado==='EN PROCESO'?'#b8860b':'#2e7d32',border:`1px solid ${p.estado==='EN PROCESO'?'#e8d88a':'#a5d6a7'}`,padding:'3px 8px',borderRadius:100,fontSize:9,fontWeight:700}}>{p.estado}</span>
                            </td>
                            <td style={{padding:'10px 14px'}}>
                              <span style={{fontSize:11,color:'#666'}}>{p.empleado||'—'}</span>
                            </td>
                            <td style={{padding:'10px 14px'}}>
                              <button onClick={()=>setModalEliminar(p.id)} style={{background:'none',border:'1px solid #ffcdd2',color:'#c62828',padding:'3px 9px',borderRadius:5,fontFamily:'DM Sans,sans-serif',fontSize:10,cursor:'pointer'}}>Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </main>

      {/* ===== NAV INFERIOR ===== */}
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1.5px solid #e0e0e0',display:'flex',zIndex:1000,boxShadow:'0 -4px 16px rgba(0,0,0,0.08)'}}>
        {navItems.map(n => (
          <button key={n.key} onClick={()=>setTab(n.key)} style={{
            flex:1,padding:'14px 4px',display:'flex',flexDirection:'column',alignItems:'center',gap:2,
            border:'none',background:'none',cursor:'pointer',transition:'0.2s',
            borderTop: tab===n.key?'3px solid #1a1a1a':'3px solid transparent'
          }}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:tab===n.key?'#1a1a1a':'#999'}}>
              {n.label}
            </span>
            {n.badge > 0 && (
              <span style={{position:'absolute',top:6,background:'#c62828',color:'#fff',borderRadius:100,minWidth:16,height:16,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>
                {n.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* MODAL PRODUCTO */}
      <Modal
        open={!!modalProducto}
        onClose={()=>setModalProducto(null)}
        title={modalProducto==='nuevo'?'Nuevo Producto': modalProducto?.nombre||'Editar Producto'}
        sub={modalProducto==='nuevo'?'Agregar al menu':'Toca el nombre para editar'}
        icon={modalProducto==='nuevo'?'+':'✎'}
        footer={null}
      >
        {modalProducto && (
          <FormProducto
            item={modalProducto==='nuevo'?null:modalProducto}
            onClose={()=>setModalProducto(null)}
            onSave={()=>setModalProducto(null)}
          />
        )}
      </Modal>

      {/* MODAL CONFIRMAR PEDIDO */}
      <Modal open={!!modalConfirm} onClose={()=>setModalConfirm(null)}
        title={modalConfirm?.offline?'Pedido Guardado Offline':'Pedido Confirmado'}
        sub={modalConfirm?.offline?'Se enviará al reconectar':'Registrado exitosamente'}
        icon='OK'
        footer={<Btn onClick={()=>setModalConfirm(null)}>Aceptar</Btn>}>
        {modalConfirm && (
          <>
            {modalConfirm.offline && <div style={{background:'#fff8e1',border:'1px solid #e8d88a',borderRadius:8,padding:'9px 13px',marginBottom:12,fontSize:12,color:'#b8860b',fontWeight:600}}>Sin conexión — Guardado localmente</div>}
            <div style={{background:'#f4f4f4',borderRadius:8,padding:12,border:'1px solid #e0e0e0'}}>
              <div style={{fontSize:11,color:'#666',marginBottom:7,fontWeight:600}}>{modalConfirm.datos?.tipoCliente} — {modalConfirm.datos?.mesa}</div>
              {modalConfirm.datos?.items?.map((it,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'3px 0',borderBottom:'1px solid #e0e0e0'}}>
                  <span>{it.cantidad}x {it.nombre}</span><span>${(it.precio*it.cantidad).toFixed(2)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0',marginTop:4}}>
                <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600}}>Total</span>
                <span style={{fontFamily:'Playfair Display,serif',fontSize:22}}>${parseFloat(modalConfirm.datos?.total||0).toFixed(2)}</span>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* MODAL ELIMINAR */}
      <Modal open={!!modalEliminar} onClose={()=>setModalEliminar(null)}
        title='Eliminar Pedido' sub='Esta acción no se puede deshacer' icon='X'
        footer={<><Btn variant='sec' onClick={()=>setModalEliminar(null)}>Cancelar</Btn><Btn variant='danger' onClick={eliminarPedido}>Eliminar</Btn></>}>
        <p style={{fontSize:13,color:'#666',lineHeight:1.6}}>Se eliminará permanentemente este pedido.</p>
      </Modal>

      <Toast/>
    </>
  )
}