import { useState, useEffect, useRef } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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
  body{font-family:'Poppins',sans-serif;background:#f7f7f7;color:#0d0d0d;min-height:100vh;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#f4f4f4;}
  ::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px;}

  /* Spinner */
  @keyframes spin{to{transform:rotate(360deg);}}

  /* Toast entrada */
  @keyframes toastIn{
    from{opacity:0;transform:translateX(40px) scale(0.95);}
    to{opacity:1;transform:translateX(0) scale(1);}
  }
  @keyframes toastOut{
    from{opacity:1;transform:translateX(0) scale(1);}
    to{opacity:0;transform:translateX(40px) scale(0.95);}
  }

  /* Modal entrada suave */
  @keyframes modalIn{
    from{opacity:0;transform:translateY(18px) scale(0.97);}
    to{opacity:1;transform:translateY(0) scale(1);}
  }

  /* Sheet (modal bottom) */
  @keyframes sheetIn{
    from{transform:translateY(100%);}
    to{transform:translateY(0);}
  }

  /* Fade general */
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}

  /* Badge bounce */
  @keyframes badgePop{
    0%{transform:scale(1);}
    40%{transform:scale(1.45);}
    70%{transform:scale(0.9);}
    100%{transform:scale(1);}
  }

  /* Pulse suave para botón carrito con items */
  @keyframes cartPulse{
    0%,100%{box-shadow:0 0 0 0 rgba(26,26,26,0.18);}
    50%{box-shadow:0 0 0 6px rgba(26,26,26,0);}
  }

  /* Ripple */
  @keyframes ripple{
    from{transform:scale(0);opacity:0.35;}
    to{transform:scale(3.5);opacity:0;}
  }

  /* Press scale en botones */
  .btn-press:active{transform:scale(0.96);}
  .btn-press{transition:transform 0.12s ease,opacity 0.12s ease;}

  /* Tabs con transición */
  @keyframes tabFade{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:translateX(0);}}

  /* Item card hover */
  .card-item{transition:box-shadow 0.2s ease,transform 0.15s ease;}
  .card-item:active{transform:scale(0.985);}

  /* Skeleton shimmer */
  @keyframes shimmer{
    0%{background-position:-400px 0;}
    100%{background-position:400px 0;}
  }
  .skeleton{
    background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);
    background-size:400px 100%;
    animation:shimmer 1.4s infinite;
    border-radius:6px;
  }

  /* Cantidad animada */
  @keyframes numPop{
    0%{transform:scale(1);}
    50%{transform:scale(1.35);}
    100%{transform:scale(1);}
  }
  .num-pop{animation:numPop 0.2s ease;}
`

// ==========================================
// SISTEMA DE SONIDOS (Web Audio API)
// ==========================================
const Sound = {
  ctx: null,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)() } catch(e) {}
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume()
  },
  play(type) {
    this.init()
    if (!this.ctx) return
    const ctx = this.ctx
    const g = ctx.createGain()
    g.connect(ctx.destination)
    const o = ctx.createOscillator()
    o.connect(g)
    const now = ctx.currentTime
    if (type === 'tap') {
      // Click suave - tap en botones
      o.type = 'sine'; o.frequency.setValueAtTime(520, now)
      g.gain.setValueAtTime(0.06, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      o.start(now); o.stop(now + 0.08)
    } else if (type === 'add') {
      // Agregar producto al carrito
      o.type = 'sine'; o.frequency.setValueAtTime(660, now)
      o.frequency.exponentialRampToValueAtTime(880, now + 0.12)
      g.gain.setValueAtTime(0.07, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      o.start(now); o.stop(now + 0.18)
    } else if (type === 'remove') {
      // Quitar producto
      o.type = 'sine'; o.frequency.setValueAtTime(440, now)
      o.frequency.exponentialRampToValueAtTime(330, now + 0.1)
      g.gain.setValueAtTime(0.05, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      o.start(now); o.stop(now + 0.12)
    } else if (type === 'success') {
      // Pedido confirmado / acción exitosa
      const freqs = [523, 659, 784]
      freqs.forEach((f, i) => {
        const o2 = ctx.createOscillator()
        const g2 = ctx.createGain()
        o2.connect(g2); g2.connect(ctx.destination)
        o2.type = 'sine'; o2.frequency.setValueAtTime(f, now + i*0.1)
        g2.gain.setValueAtTime(0.06, now + i*0.1)
        g2.gain.exponentialRampToValueAtTime(0.001, now + i*0.1 + 0.2)
        o2.start(now + i*0.1); o2.stop(now + i*0.1 + 0.2)
      })
      return
    } else if (type === 'notify') {
      // Nuevo pedido en admin
      const o2 = ctx.createOscillator()
      const g2 = ctx.createGain()
      o2.connect(g2); g2.connect(ctx.destination)
      o2.type = 'sine'
      o2.frequency.setValueAtTime(880, now)
      o2.frequency.setValueAtTime(660, now + 0.15)
      g2.gain.setValueAtTime(0.08, now)
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      o2.start(now); o2.stop(now + 0.3)
      return
    } else if (type === 'error') {
      o.type = 'sawtooth'; o.frequency.setValueAtTime(180, now)
      g.gain.setValueAtTime(0.05, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      o.start(now); o.stop(now + 0.15)
    }
  }
}

let toastFn = null
function Toast() {
  const [toasts, setToasts] = useState([])
  toastFn = (type, msg) => {
    const id = Date.now()
    // Sonido según tipo
    if (type === 'ok') try{Sound.play('success')}catch(e){}
    else if (type === 'err') try{Sound.play('error')}catch(e){}
    setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }
  const colors = { ok:'#22c55e', warn:'#f59e0b', err:'#ef4444' }
  const labels  = { ok:'✓', warn:'!', err:'×' }
  return (
    <div style={{position:'fixed',bottom:90,right:16,zIndex:3000,display:'flex',flexDirection:'column',gap:8,pointerEvents:'none'}}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background:'#1a1a1a', borderRadius:10, padding:'11px 16px',
          minWidth:220, maxWidth:280, display:'flex', alignItems:'center', gap:10,
          boxShadow:'0 8px 32px rgba(0,0,0,0.22)',
          animation:'toastIn 0.28s cubic-bezier(0.34,1.4,0.64,1)',
          borderLeft:`3px solid ${colors[t.type]}`
        }}>
          <span style={{fontSize:11,fontWeight:700,color:colors[t.type],flexShrink:0}}>{labels[t.type]}</span>
          <span style={{fontSize:11,color:'#e0e0e0',fontFamily:'Poppins,sans-serif',fontWeight:400,lineHeight:1.4}}>{t.msg}</span>
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
  function handleClick(e) {
    if (disabled) return
    try { Sound.play('tap') } catch(err) {}
    onClick && onClick(e)
  }
  const base = {
    padding:'11px 20px', borderRadius:9, fontFamily:'Poppins,sans-serif',
    fontSize:12, fontWeight:600, letterSpacing:1, textTransform:'uppercase',
    cursor: disabled?'not-allowed':'pointer', border:'none',
    transition:'transform 0.12s ease, box-shadow 0.18s ease',
    ...style
  }
  const variants = {
    primary: { background: disabled?'#e8e8e8':'#1a1a1a', color: disabled?'#999':'#fff',
      boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
    danger:  { background:'#c62828', color:'#fff',
      boxShadow:'0 2px 8px rgba(198,40,40,0.15)' },
    sec:     { background:'#fff', color:'#666', border:'1.5px solid #d0d0d0' }
  }
  return (
    <button style={{...base,...variants[variant]}}
      onClick={handleClick}
      disabled={disabled}
      onMouseDown={e=>{ if(!disabled) e.currentTarget.style.transform='scale(0.96)' }}
      onMouseUp={e=>{ e.currentTarget.style.transform='scale(1)' }}
      onTouchStart={e=>{ if(!disabled) e.currentTarget.style.transform='scale(0.96)' }}
      onTouchEnd={e=>{ e.currentTarget.style.transform='scale(1)' }}
    >
      {children}
    </button>
  )
}

function Input({ label, type='text', value, onChange, placeholder, readonly }) {
  return (
    <div style={{marginBottom:13}}>
      {label && <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} readOnly={readonly}
        style={{width:'100%',background:readonly?'#f4f4f4':'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:readonly?'#666':'#1a1a1a',
          fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{marginBottom:13}}>
      {label && <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:'#1a1a1a',
          fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',cursor:'pointer'}}>
        <option value=''>Seleccionar...</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Modal({ open, onClose, title, sub, icon, children, footer }) {
  if (!open) return null
  return (
    <div onClick={e=>{if(e.target===e.currentTarget){ try{Sound.play('tap')}catch(e){} onClose() }}}
      style={{position:'fixed',inset:0,
        background:'rgba(0,0,0,0.46)',
        backdropFilter:'blur(4px)',
        zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:16,width:'92%',maxWidth:460,
        overflow:'hidden',boxShadow:'0 24px 64px rgba(0,0,0,0.18)',
        animation:'modalIn 0.28s cubic-bezier(0.34,1.3,0.64,1)'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #e0e0e0',display:'flex',alignItems:'center',gap:13,background:'#f9f9f9'}}>
          {icon && <div style={{width:36,height:36,background:'#1a1a1a',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:13,flexShrink:0}}>{icon}</div>}
          <div style={{flex:1}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:600,color:'#1a1a1a'}}>{title}</div>
            {sub && <div style={{fontSize:11,color:'#aaa',marginTop:2,fontFamily:'Poppins,sans-serif'}}>{sub}</div>}
          </div>
          <button onClick={()=>{try{Sound.play('tap')}catch(e){}onClose()}} style={{
            background:'#f0f0f0',border:'none',width:28,height:28,borderRadius:'50%',
            cursor:'pointer',color:'#888',fontSize:16,display:'flex',alignItems:'center',
            justifyContent:'center',flexShrink:0,transition:'background 0.15s'
          }}>×</button>
        </div>
        <div style={{padding:'18px 20px',maxHeight:'65vh',overflowY:'auto'}}>{children}</div>
        {footer && <div style={{padding:'12px 20px',borderTop:'1px solid #e0e0e0',display:'flex',gap:8,justifyContent:'flex-end',background:'#f9f9f9'}}>{footer}</div>}
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
          <h1 style={{fontFamily:'Poppins,sans-serif',fontSize:28,fontWeight:700,color:'#1a1a1a',letterSpacing:2}}>Esencial FC</h1>
          
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
                <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:20,marginBottom:5}}>Bienvenido</h2>
                <p style={{fontSize:12,color:'#999',marginBottom:20}}>Ingresa tus credenciales</p>
                <Input label='Correo' type='email' value={email} onChange={setEmail} placeholder='correo@ejemplo.com'/>
                <Input label='Contrasena' type='password' value={pass} onChange={setPass} placeholder='••••••••'/>
                <Btn onClick={doLogin} disabled={loading} style={{width:'100%',marginTop:4}}>
                  {loading?'Ingresando...':'Ingresar'}
                </Btn>
              </>
            ) : (
              <>
                <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:20,marginBottom:5}}>Crear Cuenta</h2>
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
  const [visibleClientes, setVisibleClientes] = useState(item?.visibleClientes!==false)
  const [loading, setLoading] = useState(false)

  async function guardar() {
    if (!nombre || !precio || !categoria) { showToast('err','Nombre, precio y categoria son obligatorios'); return }
    setLoading(true)
    const datos = { nombre, descripcion, precio: parseFloat(precio), categoria, imagen, disponible, visibleClientes }
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
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'10px 13px',background:'#f4f4f4',borderRadius:8,border:'1px solid #e0e0e0'}}>
        <span style={{fontSize:12,fontWeight:600,color:'#666'}}>Disponible en menu</span>
        <button onClick={()=>setDisponible(!disponible)} style={{
          width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',transition:'0.2s',
          background:disponible?'#1a1a1a':'#ccc',position:'relative'
        }}>
          <div style={{position:'absolute',top:2,left:disponible?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'0.2s'}}/>
        </button>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,padding:'10px 13px',background:'#f0f4ff',borderRadius:8,border:'1px solid #c5d0e8'}}>
        <div>
          <span style={{fontSize:12,fontWeight:600,color:'#7C9263'}}>Mostrar en Clientes</span>
          <div style={{fontSize:10,color:'#888',marginTop:2}}>{visibleClientes?'Visible en app de clientes':'Oculto para clientes'}</div>
        </div>
        <button onClick={()=>setVisibleClientes(!visibleClientes)} style={{
          width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',transition:'0.2s',
          background:visibleClientes?'#7C9263':'#ccc',position:'relative',flexShrink:0
        }}>
          <div style={{position:'absolute',top:2,left:visibleClientes?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'0.2s'}}/>
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
function comprimirImagen(base64, maxWidth=800) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.src = base64
  })
}

function AdminApp() {
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
  const [modalPromocion, setModalPromocion] = useState(null) // null | 'nueva' | {item} -- solo admin
  const [modalVerPromociones, setModalVerPromociones] = useState(false) // todos los empleados
  const [promociones, setPromociones] = useState([])
  const [pedidosDomicilio, setPedidosDomicilio] = useState([])
  const [pedidosDomicilioHoy, setPedidosDomicilioHoy] = useState([])
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendientesSync, setPendientesSync] = useState([])
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [nombreEmpleado, setNombreEmpleado] = useState('')
  const [esAdmin, setEsAdmin] = useState(false)
  const [fotoPerfil, setFotoPerfil] = useState(null) // se carga desde localStorage cuando hay user
  const [modalPerfil, setModalPerfil] = useState(false)
  const [modalAdmin, setModalAdmin] = useState(false)
  const [empleadosPendientes, setEmpleadosPendientes] = useState([])
  const [editNombre, setEditNombre] = useState('')
  const [editFoto, setEditFoto] = useState(null)
  const [loadingPerfil, setLoadingPerfil] = useState(false)
  const [empleadosActivos, setEmpleadosActivos] = useState([])
  const fotoPerfRef = useRef(null)
  // Comprobante camara
  const [fotoComprobante, setFotoComprobante] = useState({}) // {pedidoId: dataURL}
  const [datosComprobante, setDatosComprobante] = useState({}) // {pedidoId: {monto,remitente,fecha,cuentaOrigen,nroComprobante}}
  const [analizandoComp, setAnalizandoComp] = useState({}) // {pedidoId: true/false}
  const [modalTransferencia, setModalTransferencia] = useState(null) // pedido obj
  const [datosCliente, setDatosCliente] = useState({})
  const [dcAbierto, setDcAbierto] = useState({}) // acordeon datos cliente
  const [tiemposPedido, setTiemposPedido] = useState({}) // {id: minutos transcurridos}

  // Actualizar contadores cada 30s
  useEffect(() => {
    function calcular() {
      const ahora = Date.now()
      const nuevos = {}
      ;[...pedidosActivos, ...(pedidosDomicilioHoy||[])].forEach(p => {
        const ts = p.creadoEn?.toDate?.()?.getTime?.()
        if (ts) nuevos[p.id] = Math.floor((ahora - ts) / 60000)
      })
      setTiemposPedido(nuevos)
    }
    calcular()
    const interval = setInterval(calcular, 30000)
    return () => clearInterval(interval)
  }, [pedidosActivos, pedidosDomicilioHoy]) // {pedidoId: {tipo,id,nombre,tel,email}}
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

  const ADMIN_EMAIL = 'sega93david@gmail.com'

  // ---- AUTH ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        // Admin siempre aprobado
        if (u.email === ADMIN_EMAIL) {
          setAprobado(true)
          setEsAdmin(true)
          setNombreEmpleado('Admin')
          // Cargar foto del admin desde Firestore si existe
          try {
            const qa = query(collection(db,'usuarios'), where('uid','==',u.uid))
            const sa = await getDocs(qa)
            if (!sa.empty && sa.docs[0].data().foto) setFotoPerfil(sa.docs[0].data().foto)
          } catch(e) {}
          setAuthReady(true)
          return
        }
        const q = query(collection(db,'usuarios'), where('uid','==',u.uid))
        const snap = await getDocs(q)
        if (!snap.empty) {
          const userData = snap.docs[0].data()
          setAprobado(userData.estado === 'APROBADO')
          setNombreEmpleado(userData.nombre || u.email)
          setFotoPerfil(userData.foto || null)
          setEditNombre(userData.nombre || '')
        } else {
          setAprobado(true)
          setNombreEmpleado(u.email)
          setEditNombre(u.email)
        }
      } else {
        setAprobado(false)
        setEsAdmin(false)
      }
      setAuthReady(true)
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

  // ---- PROMOCIONES (tiempo real) ----
  useEffect(() => {
    if (!user || !aprobado) return
    const unsub = onSnapshot(collection(db,'promociones'), snap => {
      setPromociones(snap.docs.map(d => ({id:d.id,...d.data()})))
    })
    return unsub
  }, [user, aprobado])

  // ---- DOMICILIO (tiempo real, solo hoy) ----
  useEffect(() => {
    if (!user || !aprobado) return
    const unsub = onSnapshot(
      query(collection(db,'domicilio'), orderBy('creadoEn','desc')),
      snap => {
        const todos = snap.docs.map(d => ({id:d.id,...d.data()}))
        const hoyStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
        const hoy = todos.filter(p => {
          if (!p.creadoEn) return false
          const f = p.creadoEn.toDate ? p.creadoEn.toDate() : new Date(p.creadoEn)
          const fStr = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`
          return fStr === hoyStr
        })
        setPedidosDomicilio(todos)
        setPedidosDomicilioHoy(hoy)
      }
    )
    return unsub
  }, [user, aprobado])

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
    try{Sound.play('add')}catch(e){}
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
    if (!cMesa) { showToast('err','Selecciona mesa o servicio'); return }
    datos = { tipoCliente:'Pendiente', idDocumento:'', cliente:'Pendiente', telefono:'', email:'', mesa:cMesa, notas:cNotas }
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
      const nuevoPedido = { id: ref.id, ...datos, items, total, estado:'EN PROCESO', empleado: nombreEmpleado, creadoEn: { toDate: () => new Date() } }
        try{Sound.play('notify')}catch(e){}
      setPedidosActivos(prev => [nuevoPedido, ...prev])
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
    const formaPago = pagoSel[id]
    const dc = datosCliente[id] || {}
    const updateData = {
      estado:'LISTO',
      formaPago,
      tipoCliente: dc.tipo==='cliente' ? 'Cliente' : dc.tipo==='final' ? 'Consumidor Final' : 'Pendiente',
      idDocumento: dc.id || '',
      cliente: dc.tipo==='cliente' ? (dc.nombre||'Sin nombre') : dc.tipo==='final' ? 'Consumidor Final' : 'Pendiente',
      telefono: dc.tel || '',
      email: dc.email || ''
    }
    // Incluir datos del comprobante si existen
    if (datosComprobante[id]) updateData.comprobante = datosComprobante[id]
    // Quitar inmediatamente de EN PROCESO
    setPedidosActivos(p => p.filter(x => x.id !== id))
    setPagoSel(p => { const n={...p}; delete n[id]; return n })
    setFotoComprobante(p => { const n={...p}; delete n[id]; return n })
    setDatosCliente(p => { const n={...p}; delete n[id]; return n })
    setDatosComprobante(p => { const n={...p}; delete n[id]; return n })
    setAnalizandoComp(p => { const n={...p}; delete n[id]; return n })
    try {
      await updateDoc(doc(db,'pedidos',id), updateData)
      try{Sound.play('success')}catch(e){}
      showToast('ok','Pedido marcado como listo')
    } catch(e) {
      showToast('err','Error al actualizar')
    }
  }

  function setDcField(pedidoId, field, value) {
    setDatosCliente(prev => ({
      ...prev,
      [pedidoId]: { ...(prev[pedidoId]||{tipo:'cliente'}), [field]: value }
    }))
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

  async function analizarComprobante(pedidoId, base64) {
    setAnalizandoComp(p => ({...p, [pedidoId]: true}))
    try {
      const comprimida = await comprimirImagen(base64)
      const mediaType = 'image/jpeg'
      const resp = await fetch('/api/analyze-comprobante', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ imageBase64: comprimida.split(',')[1], mediaType })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.detail?.error?.message || result.error || 'Error ' + resp.status)
      setDatosComprobante(p => ({...p, [pedidoId]: result}))
      showToast('ok','Comprobante analizado')
    } catch(e) {
      showToast('warn', e.message || 'No se pudo analizar el comprobante')
    }
    setAnalizandoComp(p => ({...p, [pedidoId]: false}))
  }

  function onFotoCapturada(pedidoId, e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = ev.target.result
      setFotoComprobante(p => ({...p, [pedidoId]: b64}))
      analizarComprobante(pedidoId, b64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
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

  // ---- DOMICILIO: MARCAR ENTREGADO ----
  async function marcarEntregado(p) {
    try {
      // Guardar en historial/pedidos como pedido entregado
      await addDoc(collection(db,'pedidos'), {
        cliente: p.cliente || 'Cliente',
        telefono: p.telefono || '',
        direccion: p.direccion || '',
        referencia: p.referencia || '',
        mesa: 'A Domicilio',
        items: p.items || [],
        subtotal: p.subtotal || 0,
        total: p.total || 0,
        estado: 'LISTO',
        tipoCliente: 'Domicilio',
        formaPago: 'Transferencia',
        empleado: nombreEmpleado,
        creadoEn: p.creadoEn || serverTimestamp()
      })
      // Eliminar de domicilio
      await deleteDoc(doc(db,'domicilio', p.id))
      showToast('ok','Pedido marcado como entregado')
    } catch(e) { showToast('err','Error al marcar entregado') }
  }

  async function eliminarDomicilio(id) {
    try {
      await deleteDoc(doc(db,'domicilio', id))
      showToast('ok','Pedido eliminado')
    } catch(e) { showToast('err','Error al eliminar') }
  }

  // ---- PERFIL ----
  async function guardarPerfil() {
    setLoadingPerfil(true)
    try {
      // Guardar nombre y foto en Firestore (foto comprimida a ~20KB, bien bajo el límite)
      const q = query(collection(db,'usuarios'), where('uid','==',user.uid))
      const snap = await getDocs(q)
      const datos = { nombre: editNombre }
      if (editFoto) datos.foto = editFoto
      if (!snap.empty) {
        await updateDoc(doc(db,'usuarios', snap.docs[0].id), datos)
      }
      setNombreEmpleado(editNombre)
      if (editFoto) setFotoPerfil(editFoto)
      showToast('ok','Perfil actualizado')
      setModalPerfil(false)
    } catch(e) { showToast('err','Error al guardar') }
    setLoadingPerfil(false)
  }

  function onFotoPerfilCapturada(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      // Comprimir imagen a max 200x200px y calidad 0.7 → siempre < 30KB
      const img = new window.Image()
      img.onload = () => {
        const MAX = 200
        const scale = Math.min(MAX / img.width, MAX / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const compressed = canvas.toDataURL('image/jpeg', 0.72)
        setEditFoto(compressed)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // ---- ADMIN: CARGAR PENDIENTES ----
  async function cargarEmpleadosActivos() {
    try {
      const q = query(collection(db,'usuarios'), where('estado','==','APROBADO'))
      const snap = await getDocs(q)
      setEmpleadosActivos(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(e => e.email !== ADMIN_EMAIL))
    } catch(e) { showToast('err','Error al cargar empleados') }
  }

  async function desvincularEmpleado(docId) {
    try {
      await updateDoc(doc(db,'usuarios', docId), { estado:'DESVINCULADO' })
      setEmpleadosActivos(p => p.filter(x => x.id !== docId))
      showToast('ok','Empleado desvinculado')
    } catch(e) { showToast('err','Error al desvincular') }
  }

  async function cargarEmpleadosPendientes() {
    try {
      const q = query(collection(db,'usuarios'), where('estado','==','PENDIENTE'))
      const snap = await getDocs(q)
      setEmpleadosPendientes(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch(e) { showToast('err','Error al cargar empleados') }
  }

  async function aprobarEmpleado(docId) {
    try {
      await updateDoc(doc(db,'usuarios', docId), { estado:'APROBADO' })
      setEmpleadosPendientes(p => p.filter(x => x.id !== docId))
      showToast('ok','Empleado aprobado')
    } catch(e) { showToast('err','Error al aprobar') }
  }

  async function rechazarEmpleado(docId) {
    try {
      await deleteDoc(doc(db,'usuarios', docId))
      setEmpleadosPendientes(p => p.filter(x => x.id !== docId))
      showToast('ok','Solicitud rechazada')
    } catch(e) { showToast('err','Error al rechazar') }
  }

  // ---- GENERAR PDF ----
  async function generarPDF(filtrados, periodoLabel, totalSum) {
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const fecha = new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'long', year:'numeric' })
    const hora = new Date().toLocaleTimeString('es-EC', { hour:'2-digit', minute:'2-digit' })

    // Fondo header
    doc.setFillColor(26, 26, 26)
    doc.rect(0, 0, pageW, 42, 'F')

    // Logo si hay
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = '/logo.png'
      await new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 2000) })
      if (img.complete && img.naturalWidth > 0) {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        doc.addImage(dataUrl, 'PNG', 8, 6, 28, 28)
      }
    } catch(e) {}

    // Nombre empresa
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('Esencial FC', 42, 18)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 180, 180)
    doc.text('Reporte de Pedidos', 42, 25)
    doc.text(`Generado: ${fecha} ${hora}`, 42, 31)

    // Periodo en header derecha
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(periodoLabel.toUpperCase(), pageW - 10, 18, { align:'right' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 180, 180)
    doc.text(`${fDesde} al ${fHasta}`, pageW - 10, 25, { align:'right' })
    doc.text(`${filtrados.length} pedido${filtrados.length!==1?'s':''}`, pageW - 10, 31, { align:'right' })

    // Linea separadora
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(10, 46, pageW - 10, 46)

    // Resumen total en caja
    doc.setFillColor(245, 245, 245)
    doc.roundedRect(10, 49, pageW - 20, 18, 3, 3, 'F')
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('TOTAL DEL PERÍODO', 16, 56)
    doc.text('PEDIDOS', pageW/2, 56, { align:'center' })

    const ef = filtrados.filter(p => p.formaPago==='Efectivo').reduce((s,p)=>s+parseFloat(p.total||0),0)
    const tr = filtrados.filter(p => p.formaPago==='Transferencia').reduce((s,p)=>s+parseFloat(p.total||0),0)

    doc.setTextColor(26, 26, 26)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(`$${totalSum.toFixed(2)}`, 16, 63)
    doc.setFontSize(10)
    doc.text(`${filtrados.length}`, pageW/2, 63, { align:'center' })

    // Desglose pago
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Efectivo: $${ef.toFixed(2)}`, pageW - 16, 57, { align:'right' })
    doc.text(`Transferencia: $${tr.toFixed(2)}`, pageW - 16, 63, { align:'right' })

    // Tabla pedidos
    const rows = filtrados.map(p => {
      const hora = p.creadoEn?.toDate?.()?.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})||'—'
      const prods = p.items?.map(it=>`${it.cantidad}x ${it.nombre}`).join(', ') || '—'
      return [
        hora,
        p.cliente || '—',
        p.mesa || '—',
        prods.length > 40 ? prods.slice(0,40)+'...' : prods,
        `$${parseFloat(p.total||0).toFixed(2)}`,
        p.formaPago || '—',
        p.empleado || '—',
        p.estado || '—'
      ]
    })

    autoTable(doc, {
      startY: 72,
      head: [['Hora','Cliente','Mesa','Productos','Total','Pago','Empleado','Estado']],
      body: rows,
      styles: { fontSize:7, cellPadding:2.5, font:'helvetica' },
      headStyles: { fillColor:[26,26,26], textColor:255, fontStyle:'bold', fontSize:7 },
      alternateRowStyles: { fillColor:[248,248,248] },
      columnStyles: {
        0: { cellWidth:14 },
        1: { cellWidth:28 },
        2: { cellWidth:18 },
        3: { cellWidth:50 },
        4: { cellWidth:16, halign:'right' },
        5: { cellWidth:22 },
        6: { cellWidth:24 },
        7: { cellWidth:18 }
      },
      margin: { left:10, right:10 },
      didDrawPage: (data) => {
        // Footer en cada página
        doc.setFontSize(7)
        doc.setTextColor(150,150,150)
        doc.setFont('helvetica','normal')
        doc.text('Esencial FC — Reporte generado automaticamente', 10, pageH - 8)
        doc.text(`Página ${data.pageNumber}`, pageW - 10, pageH - 8, { align:'right' })
      }
    })

    // Guardar o compartir
    const pdfBlob = doc.output('blob')
    const nombreArchivo = `esencial-fc-reporte-${fDesde}.pdf`

    if (navigator.share) {
      try {
        const file = new File([pdfBlob], nombreArchivo, { type:'application/pdf' })
        if (navigator.canShare({ files:[file] })) {
          await navigator.share({ files:[file], title:'Reporte Esencial FC' })
          return
        }
      } catch(e) {}
    }
    // Fallback: descargar
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url; a.download = nombreArchivo; a.click()
    URL.revokeObjectURL(url)
    showToast('ok', 'PDF generado y descargado')
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

  // Solo mostrar Cuenta Pendiente si ya terminó de cargar Y el usuario existe Y no está aprobado
  if (authReady && user && !aprobado) return (
    <>
      <style>{G}</style>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16,padding:20,textAlign:'center'}}>
        <img src='/logo.png' alt='Logo' style={{height:60,objectFit:'contain'}}/>
        <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22}}>Cuenta Pendiente</h2>
        <p style={{color:'#999',fontSize:13,maxWidth:320}}>Tu solicitud está siendo revisada por el administrador.</p>
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
    { key:'domicilio', label:'Domicilio', badge: pedidosDomicilioHoy.length },
    { key:'historial', label:'Historial' },
  ]

  return (
    <>
      <style>{G}</style>

      {/* OFFLINE BANNER */}
      {!isOnline && (
        <div style={{background:'#b8860b',color:'#fff',textAlign:'center',padding:'8px 16px',fontSize:11,fontWeight:600,position:'fixed',top:0,left:0,right:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:'#fff',display:'inline-block',flexShrink:0}}/>
          Modo offline — Los cambios se sincronizaran al reconectar
          {pendientesSync.length > 0 && <span style={{background:'rgba(0,0,0,0.3)',borderRadius:100,padding:'1px 7px'}}>{pendientesSync.length} pendiente{pendientesSync.length>1?'s':''}</span>}
        </div>
      )}

      {/* HEADER */}
      <header style={{background:'#1a1a1a',padding:'0 16px',position:'sticky',top:isOnline?0:34,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'space-between',height:58}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
              <img src='/logo.png' alt='logo' style={{height:30,width:30,objectFit:'contain',borderRadius:4,flexShrink:0}}/>
              <span style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,color:'#fff',letterSpacing:2}}>Esencial FC</span>
            </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {showInstall && (
            <button onClick={instalarApp} style={{background:'#fff',border:'none',color:'#1a1a1a',padding:'6px 11px',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:10,fontWeight:600,cursor:'pointer'}}>
              Instalar
            </button>
          )}
          {pendientesSync.length > 0 && (
            <span style={{background:'#b8860b',color:'#fff',borderRadius:100,padding:'2px 8px',fontSize:9,fontWeight:700}}>
              {pendientesSync.length} offline
            </span>
          )}
          {/* BOTON ADMIN - solo para admin */}
          {esAdmin && (
            <button onClick={()=>{setModalAdmin(true);cargarEmpleadosPendientes()}} style={{
              background:'none',border:'1px solid #888',color:'#ccc',padding:'5px 10px',
              borderRadius:6,cursor:'pointer',fontFamily:'Poppins,sans-serif',fontSize:10,position:'relative'
            }}>
              Empleados
              {empleadosPendientes.length>0 && (
                <span style={{position:'absolute',top:-5,right:-5,background:'#c62828',color:'#fff',borderRadius:'50%',width:14,height:14,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {empleadosPendientes.length}
                </span>
              )}
            </button>
          )}
          {/* FOTO PERFIL */}
          <button onClick={()=>{setEditNombre(nombreEmpleado);setEditFoto(null);setModalPerfil(true);if(esAdmin)cargarEmpleadosActivos()}} style={{
            width:36,height:36,borderRadius:'50%',border:'2px solid #555',
            background:'#333',cursor:'pointer',overflow:'hidden',padding:0,flexShrink:0
          }}>
            {fotoPerfil
              ? <img src={fotoPerfil} alt='perfil' style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              : <span style={{color:'#ccc',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
                  {nombreEmpleado?.charAt(0)?.toUpperCase()||'?'}
                </span>
            }
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
                <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:600}}>Menu</h2>
                <p style={{fontSize:11,color:'#999',marginTop:2}}>{menuItems.length} productos</p>
              </div>
              <div style={{display:'flex',gap:8}}>
                {(() => {
                  const hoy = (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
                  const promoHoy = promociones.filter(p => p.fecha === hoy).length
                  return (
                    <button onClick={()=>setModalVerPromociones(true)} style={{
                      background:'#fff',color:'#1a1a1a',border:'2px solid #1a1a1a',borderRadius:9,padding:'10px 14px',
                      fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',
                      display:'flex',alignItems:'center',gap:6,position:'relative'
                    }}>
                      Promociones
                      {promoHoy > 0 && (
                        <span style={{position:'absolute',top:-6,right:-6,background:'#c62828',color:'#fff',borderRadius:'50%',width:16,height:16,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {promoHoy}
                        </span>
                      )}
                    </button>
                  )
                })()}
                <button onClick={()=>setModalProducto('nuevo')} style={{
                  background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,padding:'10px 16px',
                  fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',
                  display:'flex',alignItems:'center',gap:6
                }}>
                  <span style={{fontSize:18,fontWeight:300}}>+</span> Agregar
                </button>
              </div>
            </div>

            {/* Categorias */}
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14}}>
              {cats.map(c => (
                <button key={c} onClick={()=>setCatActiva(c)} style={{
                  padding:'6px 14px',borderRadius:100,border:'2px solid',fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:500,cursor:'pointer',transition:'0.2s',
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
                    <div style={{fontFamily:'Poppins,sans-serif',fontSize:16,color:'#1a1a1a',minWidth:50,textAlign:'right'}}>
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
              <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:600}}>Mi Pedido</h2>
              <p style={{fontSize:11,color:'#999',marginTop:2}}>Revisa y confirma</p>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {/* Carrito */}
              <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid #e0e0e0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f4f4f4'}}>
                  <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#666',fontWeight:600}}>Productos</span>
                  <button onClick={()=>setCart([])} style={{background:'none',border:'1px solid #e0e0e0',color:'#666',fontSize:11,cursor:'pointer',fontFamily:'Poppins,sans-serif',padding:'3px 9px',borderRadius:6}}>Limpiar</button>
                </div>
                {!cart.length ? (
                  <div style={{padding:36,textAlign:'center',color:'#999',fontSize:12}}>Pedido vacio. Ve al menu y agrega productos.</div>
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

              {/* Solo Mesa y Notas */}
              <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid #e0e0e0',background:'#f4f4f4'}}>
                  <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#666',fontWeight:600}}>Datos del pedido</span>
                </div>
                <div style={{padding:'14px 16px'}}>
                  <Select label='Mesa / Servicio *' value={cMesa} onChange={setCMesa} options={mesaOpts}/>
                  <div style={{marginBottom:13}}>
                    <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Notas</label>
                    <textarea value={cNotas} onChange={e=>setCNotas(e.target.value)} placeholder='Sin cebolla, extra salsa...'
                      style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',minHeight:60,resize:'vertical'}}/>
                  </div>
                </div>
                {!isOnline && (
                  <div style={{margin:'0 16px 12px',padding:'9px 13px',background:'#fff8e1',border:'1px solid #e8d88a',borderRadius:8,fontSize:11,color:'#b8860b',fontWeight:600}}>
                    Sin internet - Pedido se guardara localmente
                  </div>
                )}
                <div style={{margin:'0 16px 12px',padding:12,background:'#f4f4f4',borderRadius:9,border:'1px solid #e0e0e0'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#999',marginBottom:6}}><span>Subtotal</span><span>${cartTotal.toFixed(2)}</span></div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0'}}>
                    <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#666',fontWeight:600}}>Total</span>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:22}}>${cartTotal.toFixed(2)}</span>
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
              <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:600}}>En Proceso</h2>
              <p style={{fontSize:11,color:'#999',marginTop:2}}>Tiempo real</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:13}}>
              {/* Pendientes offline */}
              {pendientesSync.map(p => (
                <div key={p._idLocal} style={{background:'#fffdf5',border:'1px solid #e8d88a',borderRadius:13,overflow:'hidden'}}>
                  <div style={{background:'#fff8e1',padding:'11px 15px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #e8d88a'}}>
                    <div style={{fontFamily:'Poppins,sans-serif',fontSize:13}}>LOCAL</div>
                    <span style={{background:'#fff8e1',color:'#b8860b',border:'1px solid #e8d88a',padding:'2px 7px',borderRadius:100,fontSize:9,fontWeight:700}}>OFFLINE</span>
                  </div>
                  <div style={{padding:'12px 15px'}}>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:7}}>{p.cliente}</div>
                    {p.items?.map((it,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'3px 0',borderBottom:'1px solid #e0e0e0'}}><span>{it.cantidad}x {it.nombre}</span><span>${(it.precio*it.cantidad).toFixed(2)}</span></div>)}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0',marginTop:7}}>
                      <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600}}>Total</span>
                      <span style={{fontFamily:'Poppins,sans-serif',fontSize:17}}>${parseFloat(p.total).toFixed(2)}</span>
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
                      <div style={{fontFamily:'Poppins,sans-serif',fontSize:13}}>{p.id.slice(0,8)}...</div>
                      <div style={{fontSize:10,color:'#999',marginTop:1}}>{p.creadoEn?.toDate?.()?.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})||''}</div>
                    </div>
                    <span style={{background:'#fff8e1',color:'#b8860b',border:'1px solid #e8d88a',padding:'3px 8px',borderRadius:100,fontSize:9,fontWeight:700}}>EN PROCESO</span>
                  </div>
                  <div style={{padding:'12px 15px'}}>
                    {/* CLIENTE + MESA PROMINENTE */}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}> 
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{p.cliente}</div>
                        {p.telefono && <div style={{fontSize:11,color:'#999',marginTop:2}}>{p.telefono}</div>}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>
                        {p.mesa && (
                          <div style={{
                            background:'#1a1a1a',color:'#fff',
                            padding:'6px 14px',borderRadius:8,
                            fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,
                            letterSpacing:1,textTransform:'uppercase',
                            boxShadow:'0 2px 8px rgba(0,0,0,0.25)',
                            minWidth:60,textAlign:'center'
                          }}>
                            {p.mesa}
                          </div>
                        )}
                        {/* CONTADOR DE TIEMPO */}
                        {(() => {
                          const mins = tiemposPedido[p.id] ?? null
                          if (mins === null) return null
                          const tarde = mins >= 30
                          return (
                            <div style={{
                              display:'flex',alignItems:'center',gap:4,
                              padding:'3px 8px',borderRadius:100,
                              background: tarde ? '#fff0f0' : '#f5f8f1',
                              border: `1.5px solid ${tarde ? '#e53935' : '#7C9263'}`,
                              fontSize:10,fontWeight:700,fontFamily:'Poppins,sans-serif',
                              color: tarde ? '#e53935' : '#7C9263',
                              whiteSpace:'nowrap'
                            }}>
                              <svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'>
                                <circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/>
                              </svg>
                              {mins < 60
                                ? `${mins} min`
                                : `${Math.floor(mins/60)}h ${mins%60}m`}
                              {tarde && ' ⚠️'}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                    {p.empleado && <div style={{fontSize:10,color:'#888',marginBottom:8,padding:'3px 8px',background:'#f4f4f4',borderRadius:5,display:'inline-block'}}>Tomado por: <strong>{p.empleado}</strong></div>}
                    {p.items?.map((it,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'3px 0',borderBottom:'1px solid #e0e0e0'}}><span>{it.cantidad}x {it.nombre}</span><span>${(it.precio*it.cantidad).toFixed(2)}</span></div>)}
                    {p.notas && <div style={{fontSize:11,color:'#666',background:'#fffdf0',border:'1px solid #e8e4c0',padding:'5px 9px',borderRadius:6,marginTop:7}}>Nota: {p.notas}</div>}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0',marginTop:7}}>
                      <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600}}>Total</span>
                      <span style={{fontFamily:'Poppins,sans-serif',fontSize:17}}>${parseFloat(p.total).toFixed(2)}</span>
                    </div>

                    {/* DATOS CLIENTE / FACTURACIÓN - ACORDEÓN */}
                    <div style={{marginTop:12,background:'#f8f8f8',border:'1px solid #e0e0e0',borderRadius:9,overflow:'hidden'}}>
                      {/* HEADER acordeón */}
                      <button onClick={()=>setDcAbierto(prev=>({...prev,[p.id]:!prev[p.id]}))} style={{
                        width:'100%',padding:'10px 13px',display:'flex',alignItems:'center',justifyContent:'space-between',
                        background:'#f0f0f0',border:'none',cursor:'pointer',
                        borderBottom:dcAbierto[p.id]?'1px solid #e0e0e0':'none'
                      }}>
                        <span style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#555'}}>
                          {(datosCliente[p.id]?.tipo||'cliente')==='cliente' ? 'Cliente' : 'Consumidor Final'}
                          {datosCliente[p.id]?.nombre && ` — ${datosCliente[p.id].nombre}`}
                        </span>
                        <span style={{fontSize:10,color:'#7C9263',fontWeight:700,display:'inline-block',
                          transition:'transform 0.2s ease',
                          transform:dcAbierto[p.id]?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
                      </button>
                      {dcAbierto[p.id] && (<div>
                      <div style={{padding:'9px 13px',borderBottom:'1px solid #e0e0e0',background:'#e8e8e8',display:'flex',gap:0}}>
                        {['cliente','final'].map(t => (
                          <button key={t} onClick={()=>setDcField(p.id,'tipo',t)} style={{
                            flex:1,padding:'7px 4px',fontSize:10,fontWeight:600,letterSpacing:1,textTransform:'uppercase',
                            cursor:'pointer',border:'none',transition:'0.2s',
                            borderBottom:(datosCliente[p.id]?.tipo||'cliente')===t?'2px solid #7C9263':'2px solid transparent',
                            background:(datosCliente[p.id]?.tipo||'cliente')===t?'#fff':'transparent',
                            color:(datosCliente[p.id]?.tipo||'cliente')===t?'#1a1a1a':'#999'
                          }}>{t==='cliente'?'Cliente':'Cons. Final'}</button>
                        ))}
                      </div>
                      <div style={{padding:'10px 13px'}}>
                        {(datosCliente[p.id]?.tipo||'cliente')==='cliente' ? (
                          <>
                            <div style={{marginBottom:8}}>
                              <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:4,fontWeight:600}}>ID / Documento</label>
                              <input value={datosCliente[p.id]?.id||''} onChange={e=>setDcField(p.id,'id',e.target.value)} placeholder='Cedula o RUC'
                                style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'7px 10px',outline:'none'}}/>
                            </div>
                            <div style={{marginBottom:8}}>
                              <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:4,fontWeight:600}}>Nombre *</label>
                              <input value={datosCliente[p.id]?.nombre||''} onChange={e=>setDcField(p.id,'nombre',e.target.value)} placeholder='Nombre completo'
                                style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'7px 10px',outline:'none'}}/>
                            </div>
                            <div style={{marginBottom:8}}>
                              <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:4,fontWeight:600}}>Telefono</label>
                              <input value={datosCliente[p.id]?.tel||''} onChange={e=>setDcField(p.id,'tel',e.target.value)} placeholder='09XXXXXXXX' type='tel'
                                style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'7px 10px',outline:'none'}}/>
                            </div>
                            <div>
                              <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:4,fontWeight:600}}>Correo</label>
                              <input value={datosCliente[p.id]?.email||''} onChange={e=>setDcField(p.id,'email',e.target.value)} placeholder='correo@ejemplo.com' type='email'
                                style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'7px 10px',outline:'none'}}/>
                            </div>
                          </>
                        ) : (
                          <div>
                            <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:4,fontWeight:600}}>ID / Documento</label>
                            <input value={datosCliente[p.id]?.id||''} onChange={e=>setDcField(p.id,'id',e.target.value)} placeholder='9999999999999'
                              style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'7px 10px',outline:'none'}}/>
                          </div>
                        )}
                      </div>
                    </div>)}
                    </div>

                    {/* PAGO */}
                    <div style={{display:'flex',gap:7,marginTop:10}}>
                      <button onClick={()=>setPagoSel(prev=>({...prev,[p.id]:'Efectivo'}))} style={{
                        flex:1,padding:'9px 6px',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',transition:'0.2s',
                        background:pagoSel[p.id]==='Efectivo'?'#7C9263':'#fff',
                        color:pagoSel[p.id]==='Efectivo'?'#fff':'#666',
                        border:`1.5px solid ${pagoSel[p.id]==='Efectivo'?'#7C9263':'#d0d0d0'}`
                      }}>Efectivo</button>
                      <button onClick={()=>setPagoSel(prev=>({...prev,[p.id]:'Transferencia'}))} style={{
                        flex:1,padding:'9px 6px',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',transition:'0.2s',
                        background:pagoSel[p.id]==='Transferencia'?'#7C9263':'#fff',
                        color:pagoSel[p.id]==='Transferencia'?'#fff':'#666',
                        border:`1.5px solid ${pagoSel[p.id]==='Transferencia'?'#7C9263':'#d0d0d0'}`
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
                              <button onClick={()=>abrirCamara(p.id)} style={{flex:1,padding:'8px',background:'#fff',border:'1.5px solid #c5d0e8',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',color:'#555'}}>
                                Retomar
                              </button>
                              <button onClick={()=>compartirComprobante(p.id)} style={{flex:1,padding:'8px',background:'#25d366',border:'none',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',color:'#fff'}}>
                                Compartir WA
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <button onClick={()=>abrirCamara(p.id)} style={{width:'100%',padding:'10px',background:'#fff',border:'1.5px dashed #c5d0e8',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer',color:'#555',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><rect x='2' y='7' width='20' height='15' rx='2'/><path d='M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'/><circle cx='12' cy='14' r='3'/></svg>
                              Tomar foto del comprobante
                            </button>
                            {analizandoComp[p.id] && (
                              <div style={{textAlign:'center',fontSize:10,color:'#7C9263',fontFamily:'Poppins,sans-serif',marginTop:6,fontWeight:600,letterSpacing:0.5}}>
                                Analizando comprobante...
                              </div>
                            )}
                            {datosComprobante[p.id] && !analizandoComp[p.id] && (
                              <div style={{background:'#f5f8f1',border:'1px solid #7C9263',borderRadius:7,padding:'7px 10px',marginTop:6}}>
                                <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#7C9263',fontWeight:700,marginBottom:5}}>Datos extraidos</div>
                                {datosComprobante[p.id].monto && <div style={{fontSize:11,color:'#1a1a1a',marginBottom:2}}><span style={{color:'#999'}}>Monto: </span>{datosComprobante[p.id].monto}</div>}
                                {datosComprobante[p.id].remitente && <div style={{fontSize:11,color:'#1a1a1a',marginBottom:2}}><span style={{color:'#999'}}>De: </span>{datosComprobante[p.id].remitente}</div>}
                                {datosComprobante[p.id].nroComprobante && <div style={{fontSize:11,color:'#1a1a1a'}}><span style={{color:'#999'}}>N: </span>{datosComprobante[p.id].nroComprobante}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button onClick={()=>marcarListo(p.id)} disabled={!pagoSel[p.id]}
                      style={{display:'block',width:'100%',marginTop:8,padding:10,background:pagoSel[p.id]?'#7C9263':'#e8e8e8',border:'none',color:pagoSel[p.id]?'#fff':'#999',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1.5,textTransform:'uppercase',cursor:pagoSel[p.id]?'pointer':'not-allowed'}}>
                      Marcar como Listo
                    </button>
                    <button onClick={()=>setModalEliminar(p.id)}
                      style={{display:'block',width:'100%',marginTop:7,padding:9,background:'#fff',border:'1.5px solid #ffcdd2',color:'#c62828',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}

              {!pedidosActivos.length && !pendientesSync.length && (
                <div style={{gridColumn:'1/-1',textAlign:'center',padding:50}}>
                  <div style={{fontFamily:'Poppins,sans-serif',fontSize:18,marginBottom:6}}>Sin pedidos activos</div>
                  <p style={{color:'#999',fontSize:12}}>Los pedidos aparecen aquí en tiempo real</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== A DOMICILIO ===== */}
        {tab==='domicilio' && (
          <div style={{animation:'fadeIn 0.3s ease'}}>
            <div style={{marginBottom:16,paddingBottom:12,borderBottom:'2px solid #e0e0e0'}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:600}}>A Domicilio</h2>
              <p style={{fontSize:11,color:'#999',marginTop:2}}>Pedidos del dia de hoy</p>
            </div>
            {pedidosDomicilioHoy.length === 0 ? (
              <div style={{textAlign:'center',padding:'60px 20px',color:'#ccc'}}>
                <div style={{fontSize:13}}>Sin pedidos a domicilio hoy</div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {pedidosDomicilioHoy.map(p => (
                  <div key={p.id} style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                    <div style={{background:'#f0f4ff',padding:'11px 15px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #dde4f5'}}>
                      <div>
                        <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,color:'#1a1a1a'}}>{p.cliente||'Cliente'}</div>
                        <div style={{fontSize:10,color:'#999',marginTop:1}}>{p.creadoEn?.toDate?.()?.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})||''}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>
                        <span style={{background:'#7C9263',color:'#fff',padding:'3px 9px',borderRadius:100,fontSize:9,fontWeight:700}}>A DOMICILIO</span>
                        {(() => {
                          const mins = tiemposPedido[p.id] ?? null
                          if (mins === null) return null
                          const tarde = mins >= 30
                          return (
                            <div style={{
                              display:'flex',alignItems:'center',gap:4,
                              padding:'3px 8px',borderRadius:100,
                              background: tarde ? '#fff0f0' : '#f5f8f1',
                              border: `1.5px solid ${tarde ? '#e53935' : '#7C9263'}`,
                              fontSize:10,fontWeight:700,fontFamily:'Poppins,sans-serif',
                              color: tarde ? '#e53935' : '#7C9263',
                              whiteSpace:'nowrap'
                            }}>
                              <svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'>
                                <circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/>
                              </svg>
                              {mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`}
                              {tarde && ' ⚠️'}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                    <div style={{padding:'12px 15px'}}>
                      {p.telefono && <div style={{fontSize:11,color:'#666',marginBottom:4}}>Tel: {p.telefono}</div>}
                      {p.direccion && <div style={{fontSize:11,color:'#666',marginBottom:4}}>Dir: {p.direccion}</div>}
                      {p.referencia && <div style={{fontSize:11,color:'#999',marginBottom:8}}>Ref: {p.referencia}</div>}
                      {p.items?.map((it,i) => (
                        <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'3px 0',borderBottom:'1px solid #f0f0f0'}}>
                          <span>{it.cantidad}x {it.nombre}</span>
                          <span>${(it.precio*it.cantidad).toFixed(2)}</span>
                        </div>
                      ))}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:9,borderTop:'1.5px solid #d0d0d0',marginTop:7}}>
                        <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600}}>Total</span>
                        <span style={{fontFamily:'Poppins,sans-serif',fontSize:17}}>${parseFloat(p.total||0).toFixed(2)}</span>
                      </div>
                      {p.notas && <div style={{fontSize:11,color:'#666',background:'#fffdf0',border:'1px solid #e8e4c0',padding:'5px 9px',borderRadius:6,marginTop:7}}>Nota: {p.notas}</div>}
                      {/* Datos comprobante domicilio */}
                      {p.comprobante && (
                        <button onClick={()=>setModalTransferencia(p)} style={{
                          width:'100%',marginTop:10,padding:'8px 14px',
                          background:'#f5f8f1',border:'1.5px solid #7C9263',
                          borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,
                          color:'#7C9263',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',gap:7
                        }}>
                          <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><rect x='2' y='3' width='20' height='18' rx='2'/><line x1='8' y1='9' x2='16' y2='9'/><line x1='8' y1='13' x2='16' y2='13'/><line x1='8' y1='17' x2='12' y2='17'/></svg>
                          Ver transferencia
                        </button>
                      )}
                      <div style={{display:'flex',gap:8,marginTop:10}}>
                        <button onClick={()=>marcarEntregado(p)} style={{
                          flex:2,padding:'10px',background:'#1a1a1a',color:'#fff',border:'none',
                          borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,
                          letterSpacing:1,textTransform:'uppercase',cursor:'pointer'
                        }}>Entregado</button>
                        <button onClick={()=>eliminarDomicilio(p.id)} style={{
                          flex:1,padding:'10px',background:'#fff',color:'#c62828',
                          border:'1.5px solid #ffcdd2',borderRadius:8,fontFamily:'Poppins,sans-serif',
                          fontSize:11,fontWeight:700,cursor:'pointer'
                        }}>Eliminar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== HISTORIAL ===== */}
        {tab==='historial' && (
          <div style={{animation:'fadeIn 0.3s ease'}}>
            <div style={{marginBottom:16,paddingBottom:12,borderBottom:'2px solid #e0e0e0',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
              <div>
                <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:600}}>Historial</h2>
                <p style={{fontSize:11,color:'#999',marginTop:2}}>Pedidos de hoy por defecto</p>
              </div>
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
                  padding:'7px 14px',borderRadius:100,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',transition:'0.2s',border:'2px solid',
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
                <input type='date' value={fDesde} onChange={e=>{setFDesde(e.target.value);setPeriodoActivo('')}} style={{background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'8px 11px',outline:'none'}}/>
              </div>
              <div>
                <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Hasta</label>
                <input type='date' value={fHasta} onChange={e=>{setFHasta(e.target.value);setPeriodoActivo('')}} style={{background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'8px 11px',outline:'none'}}/>
              </div>
              <Btn onClick={()=>{setPeriodoActivo('');loadHistorial()}}>Filtrar</Btn>
              <div style={{flex:1,minWidth:160}}>
                <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Buscar</label>
                <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder='Nombre, ID o telefono...'
                  style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:7,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:12,padding:'8px 11px',outline:'none'}}/>
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
                  <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
                    <button onClick={()=>generarPDF(filtrados, periodoActivo==='hoy'?'Hoy':periodoActivo==='ayer'?'Ayer':periodoActivo==='semana'?'Semana actual':periodoActivo==='semana_ant'?'Semana anterior':periodoActivo==='mes'?'Este mes':'Período', totalSum)}
                      style={{background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,padding:'10px 18px',fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
                      Exportar PDF
                    </button>
                  </div>
                  <div style={{background:'#1a1a1a',borderRadius:13,padding:'14px 20px',marginBottom:13,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                    <div>
                      <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#888',fontWeight:600}}>
                        {periodoActivo==='hoy'?'HOY':periodoActivo==='ayer'?'AYER':periodoActivo==='semana'?'SEMANA ACTUAL':periodoActivo==='semana_ant'?'SEMANA ANTERIOR':periodoActivo==='mes'?'ESTE MES':'PERÍODO SELECCIONADO'}
                      </div>
                      <div style={{fontSize:11,color:'#666',marginTop:2}}>{filtrados.length} pedido{filtrados.length!==1?'s':''}</div>
                    </div>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:30,color:'#fff'}}>${totalSum.toFixed(2)}</div>
                  </div>
                  <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:13,overflow:'hidden',overflowX:'auto',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead>
                        <tr>
                          {['Hora','Cliente','Mesa','Productos','Total','Pago','Estado','Empleado','Transferencia','Accion'].map(h => (
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
                            <td style={{padding:'10px 14px',fontFamily:'Poppins,sans-serif',fontSize:14}}>${parseFloat(p.total||0).toFixed(2)}</td>
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
                              {p.comprobante ? (
                                <button onClick={()=>setModalTransferencia(p)} style={{
                                  background:'#f5f8f1',border:'1.5px solid #7C9263',color:'#7C9263',
                                  padding:'4px 10px',borderRadius:6,fontFamily:'Poppins,sans-serif',
                                  fontSize:10,fontWeight:700,cursor:'pointer',
                                  display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'
                                }}>
                                  <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><rect x='2' y='3' width='20' height='18' rx='2'/><line x1='8' y1='9' x2='16' y2='9'/><line x1='8' y1='13' x2='16' y2='13'/><line x1='8' y1='17' x2='12' y2='17'/></svg>
                                  Ver transferencia
                                </button>
                              ) : <span style={{fontSize:10,color:'#ccc'}}>—</span>}
                            </td>
                            <td style={{padding:'10px 14px'}}>
                              <button onClick={()=>setModalEliminar(p.id)} style={{background:'none',border:'1px solid #ffcdd2',color:'#c62828',padding:'3px 9px',borderRadius:5,fontFamily:'Poppins,sans-serif',fontSize:10,cursor:'pointer'}}>Eliminar</button>
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
            flex:1,padding:'18px 4px 14px',display:'flex',flexDirection:'column',alignItems:'center',gap:4,
            border:'none',background:'none',cursor:'pointer',transition:'0.2s',position:'relative',
            borderTop: tab===n.key?'3px solid #7C9263':'3px solid transparent'
          }}>
            {n.badge > 0 && (
              <span style={{position:'absolute',top:6,right:'15%',background:'#c62828',color:'#fff',borderRadius:100,minWidth:17,height:17,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>
                {n.badge}
              </span>
            )}
            <span style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:tab===n.key?'#7C9263':'#999'}}>
              {n.label}
            </span>
          </button>
        ))}
      </nav>

      {/* MODAL PERFIL */}
      <Modal open={modalPerfil} onClose={()=>setModalPerfil(false)}
        title='Mi Perfil' sub={user?.email} icon='P'
        footer={<><Btn variant='sec' onClick={()=>setModalPerfil(false)}>Cancelar</Btn><Btn onClick={guardarPerfil} disabled={loadingPerfil}>{loadingPerfil?'Guardando...':'Guardar'}</Btn></>}>
        <div style={{textAlign:'center',marginBottom:20}}>
          {/* Foto perfil */}
          <div style={{width:90,height:90,borderRadius:'50%',border:'3px solid #e0e0e0',overflow:'hidden',margin:'0 auto 12px',background:'#f4f4f4',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}
            onClick={()=>fotoPerfRef.current?.click()}>
            {(editFoto||fotoPerfil)
              ? <img src={editFoto||fotoPerfil} alt='perfil' style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              : <span style={{fontSize:32,fontWeight:700,color:'#999'}}>{nombreEmpleado?.charAt(0)?.toUpperCase()||'?'}</span>
            }
          </div>
          <input type='file' accept='image/*' style={{display:'none'}} ref={fotoPerfRef} onChange={onFotoPerfilCapturada}/>
          <button onClick={()=>fotoPerfRef.current?.click()} style={{background:'none',border:'1px solid #d0d0d0',color:'#666',borderRadius:7,padding:'5px 14px',fontFamily:'Poppins,sans-serif',fontSize:11,cursor:'pointer'}}>
            Cambiar foto
          </button>
        </div>
        <div style={{marginBottom:13}}>
          <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Nombre</label>
          <input value={editNombre} onChange={e=>setEditNombre(e.target.value)}
            style={{width:'100%',background:'#fff',border:'1.5px solid #d0d0d0',borderRadius:8,color:'#1a1a1a',fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
        </div>
        <div style={{padding:'10px 13px',background:'#f4f4f4',borderRadius:8,border:'1px solid #e0e0e0'}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,textTransform:'uppercase',fontWeight:600,marginBottom:3}}>Correo</div>
          <div style={{fontSize:13,color:'#666'}}>{user?.email}</div>
        </div>
        {esAdmin && (
          <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid #e0e0e0'}}>
            {/* Lista empleados activos */}
            <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600,marginBottom:10}}>
              Empleados con acceso
            </div>
            {empleadosActivos.length === 0 ? (
              <div style={{fontSize:12,color:'#ccc',textAlign:'center',padding:'10px 0',marginBottom:12}}>Sin empleados registrados</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {empleadosActivos.map(emp => (
                  <div key={emp.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:'#f8f8f8',borderRadius:9,border:'1px solid #e0e0e0'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{emp.nombre||'Sin nombre'}</div>
                      <div style={{fontSize:11,color:'#999',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{emp.email}</div>
                    </div>
                    <button onClick={()=>desvincularEmpleado(emp.id)} style={{
                      flexShrink:0,marginLeft:10,padding:'6px 12px',background:'#fff',color:'#c62828',
                      border:'1.5px solid #ffcdd2',borderRadius:7,fontFamily:'Poppins,sans-serif',
                      fontSize:10,fontWeight:700,cursor:'pointer'
                    }}>Desvincular</button>
                  </div>
                ))}
              </div>
            )}
            {/* Botón gestionar promociones */}
            <button onClick={()=>{setModalPerfil(false);setModalPromocion('nueva')}} style={{
              width:'100%',padding:'11px',background:'#fff',color:'#1a1a1a',
              border:'2px solid #1a1a1a',borderRadius:9,fontFamily:'Poppins,sans-serif',
              fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'
            }}>
              Gestionar Promociones
            </button>
          </div>
        )}
        <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #e0e0e0',textAlign:'center'}}>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={()=>{localStorage.removeItem('esencial_modo');window.location.reload()}} style={{
              background:'#f4f4f4',border:'1px solid #e0e0e0',color:'#1a1a1a',
              borderRadius:7,padding:'8px 20px',fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',width:'100%'
            }}>← Regresar a Inicio</button>
            <button onClick={()=>signOut(auth)} style={{background:'none',border:'1px solid #ffcdd2',color:'#c62828',borderRadius:7,padding:'8px 20px',fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
              Cerrar Sesion
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL ADMIN - EMPLEADOS */}
      <Modal open={modalAdmin} onClose={()=>setModalAdmin(false)}
        title='Gestión de Empleados' sub='Aprueba o rechaza accesos' icon='A'>
        {empleadosPendientes.length === 0 ? (
          <div style={{textAlign:'center',padding:'30px 0',color:'#999',fontSize:13}}>
            No hay solicitudes pendientes
          </div>
        ) : empleadosPendientes.map(emp => (
          <div key={emp.id} style={{padding:'13px',border:'1px solid #e0e0e0',borderRadius:10,marginBottom:10,background:'#fafafa'}}>
            <div style={{fontWeight:600,fontSize:14,color:'#1a1a1a',marginBottom:3}}>{emp.nombre}</div>
            <div style={{fontSize:12,color:'#666',marginBottom:10}}>{emp.email}</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>aprobarEmpleado(emp.id)} style={{flex:1,padding:'9px',background:'#7C9263',color:'#fff',border:'none',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                Aprobar acceso
              </button>
              <button onClick={()=>rechazarEmpleado(emp.id)} style={{flex:1,padding:'9px',background:'#fff',color:'#c62828',border:'1.5px solid #ffcdd2',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </Modal>

      {/* MODAL PROMOCIONES */}
      {modalPromocion !== null && (
        <FormPromocion
          initial={modalPromocion==='nueva' ? null : modalPromocion}
          promocionesHoy={promociones.filter(p => { const hoy = (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(); return p.fecha===hoy })}
          onClose={()=>setModalPromocion(null)}
        />
      )}

      {/* MODAL VER PROMOCIONES - todos los empleados */}
      <Modal open={modalVerPromociones} onClose={()=>setModalVerPromociones(false)}
        title='Promociones' sub='Promociones activas del dia' icon='P'>
        {(() => {
          const hoy = (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
          const activas = promociones.filter(p => p.fecha === hoy)
          const proximas = promociones.filter(p => p.fecha > hoy)
          return (
            <>
              {activas.length === 0 && proximas.length === 0 && (
                <div style={{textAlign:'center',padding:'30px 0',color:'#999',fontSize:13}}>No hay promociones registradas</div>
              )}
              {activas.length > 0 && (
                <>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#c62828',fontWeight:700,marginBottom:10}}>Activas hoy</div>
                  {activas.map(p => (
                    <div key={p.id} style={{border:'2px solid #c62828',borderRadius:11,overflow:'hidden',marginBottom:12}}>
                      {p.imagen && <img src={p.imagen} alt={p.nombre} style={{width:'100%',height:140,objectFit:'cover',display:'block'}}/>}
                      <div style={{padding:'12px 14px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                          <div style={{fontWeight:700,fontSize:15,color:'#1a1a1a'}}>{p.nombre}</div>
                          <span style={{fontFamily:'Poppins,sans-serif',fontSize:18,color:'#c62828',fontWeight:700}}>${parseFloat(p.precio).toFixed(2)}</span>
                        </div>
                        {p.descripcion && <div style={{fontSize:12,color:'#666',marginTop:5,lineHeight:1.5}}>{p.descripcion}</div>}
                        <span style={{display:'inline-block',marginTop:8,background:'#c62828',color:'#fff',fontSize:9,fontWeight:700,letterSpacing:1,textTransform:'uppercase',padding:'3px 9px',borderRadius:100}}>Activa hoy</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {proximas.length > 0 && (
                <>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:700,marginBottom:10,marginTop:activas.length?16:0}}>Proximas</div>
                  {proximas.map(p => (
                    <div key={p.id} style={{border:'1px solid #e0e0e0',borderRadius:11,padding:'12px 14px',marginBottom:10,background:'#fafafa'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div style={{fontWeight:600,fontSize:14,color:'#1a1a1a'}}>{p.nombre}</div>
                        <span style={{fontFamily:'Poppins,sans-serif',fontSize:16}}>${parseFloat(p.precio).toFixed(2)}</span>
                      </div>
                      {p.descripcion && <div style={{fontSize:12,color:'#666',marginTop:4}}>{p.descripcion}</div>}
                      <div style={{fontSize:11,color:'#999',marginTop:6}}>Fecha: {p.fecha}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )
        })()}
      </Modal>

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
                <span style={{fontFamily:'Poppins,sans-serif',fontSize:22}}>${parseFloat(modalConfirm.datos?.total||0).toFixed(2)}</span>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Modal Ver Transferencia */}
      {modalTransferencia && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget)setModalTransferencia(null)}}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:360,overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <div style={{background:'#1a1a1a',padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:14,color:'#fff'}}>Datos de Transferencia</div>
                <div style={{fontSize:10,color:'#888',marginTop:2}}>{modalTransferencia.cliente} {modalTransferencia.mesa ? '— ' + modalTransferencia.mesa : ''}</div>
              </div>
              <button onClick={()=>setModalTransferencia(null)} style={{background:'none',border:'none',color:'#999',fontSize:20,cursor:'pointer',lineHeight:1}}>x</button>
            </div>
            <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:0}}>
              {[
                {label:'Monto', value: modalTransferencia.comprobante?.monto},
                {label:'Remitente', value: modalTransferencia.comprobante?.remitente},
                {label:'Fecha', value: modalTransferencia.comprobante?.fecha},
                {label:'Cuenta Origen', value: modalTransferencia.comprobante?.cuentaOrigen},
                {label:'N Comprobante', value: modalTransferencia.comprobante?.nroComprobante},
              ].map(({label, value}) => value ? (
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'#999',fontWeight:600}}>{label}</span>
                  <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:600,color:'#1a1a1a',textAlign:'right',maxWidth:'60%'}}>{value}</span>
                </div>
              ) : null)}
            </div>
            <div style={{padding:'0 20px 20px'}}>
              <button onClick={()=>setModalTransferencia(null)} style={{width:'100%',padding:'11px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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


// ==========================================
// FORM PROMOCION (componente separado)
// ==========================================
function FormPromocion({ initial, promocionesHoy, onClose }) {
  const [nombre, setNombre] = useState(initial?.nombre||'')
  const [fecha, setFecha] = useState(initial?.fecha || (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })())
  const [precio, setPrecio] = useState(initial?.precio||'')
  const [descripcion, setDescripcion] = useState(initial?.descripcion||'')
  const [imagen, setImagen] = useState(initial?.imagen||'')
  const [saving, setSaving] = useState(false)
  const [vista, setVista] = useState('lista') // 'lista' | 'nueva'

  async function guardar() {
    if (!nombre || !fecha || !precio) { showToast('err','Nombre, fecha y precio son obligatorios'); return }
    setSaving(true)
    try {
      const data = { nombre, fecha, precio: parseFloat(precio), descripcion, imagen }
      if (initial?.id) await updateDoc(doc(db,'promociones',initial.id), data)
      else await addDoc(collection(db,'promociones'), data)
      showToast('ok', initial?.id ? 'Promocion actualizada' : 'Promocion creada')
      setVista('lista')
      if (!initial?.id) { setNombre(''); setPrecio(''); setDescripcion(''); setImagen('') }
    } catch(e) { showToast('err','Error al guardar') }
    setSaving(false)
  }

  async function eliminar(id) {
    try { await deleteDoc(doc(db,'promociones',id)); showToast('ok','Eliminada') }
    catch(e) { showToast('err','Error') }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:3000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',padding:'20px 20px 40px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <h3 style={{fontFamily:'Poppins,sans-serif',fontSize:20}}>Promociones</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#999'}}>×</button>
        </div>

        {vista==='lista' ? (
          <>
            <button onClick={()=>setVista('nueva')} style={{width:'100%',padding:'12px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer',marginBottom:16}}>
              + Nueva promocion
            </button>
            {promocionesHoy.length > 0 && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600,marginBottom:8}}>Activas hoy</div>
                {promocionesHoy.map(p => (
                  <div key={p.id} style={{border:'1px solid #e0e0e0',borderRadius:10,padding:'12px',marginBottom:8,background:'#fffdf5',position:'relative'}}>
                    <div style={{fontWeight:600,fontSize:13}}>{p.nombre}</div>
                    <div style={{fontSize:12,color:'#666',marginTop:2}}>{p.descripcion}</div>
                    <div style={{fontFamily:'Poppins,sans-serif',fontSize:16,marginTop:4}}>${parseFloat(p.precio).toFixed(2)}</div>
                    <button onClick={()=>eliminar(p.id)} style={{position:'absolute',top:10,right:10,background:'none',border:'1px solid #ffcdd2',color:'#c62828',borderRadius:6,padding:'3px 8px',fontSize:10,cursor:'pointer',fontFamily:'Poppins,sans-serif'}}>Eliminar</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={()=>setVista('lista')} style={{background:'none',border:'none',fontSize:13,color:'#999',cursor:'pointer',marginBottom:16,fontFamily:'Poppins,sans-serif'}}>← Volver</button>
            <div style={{marginBottom:13}}>
              <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Nombre *</label>
              <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder='Nombre de la promocion'
                style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
            </div>
            <div style={{marginBottom:13}}>
              <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Fecha *</label>
              <input type='date' value={fecha} onChange={e=>setFecha(e.target.value)}
                style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
            </div>
            <div style={{marginBottom:13}}>
              <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Precio *</label>
              <input type='number' value={precio} onChange={e=>setPrecio(e.target.value)} placeholder='0.00'
                style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
            </div>
            <div style={{marginBottom:13}}>
              <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Descripcion</label>
              <textarea value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder='Describe la promocion...' rows={3}
                style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',resize:'vertical'}}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>URL de imagen</label>
              <input value={imagen} onChange={e=>setImagen(e.target.value)} placeholder='https://...'
                style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none'}}/>
            </div>
            <button onClick={guardar} disabled={saving} style={{width:'100%',padding:'13px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'}}>
              {saving ? 'Guardando...' : 'Guardar promocion'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ==========================================
// IMAGENES PROFESIONALES POR CATEGORIA
// ==========================================
const IMGS_CATEGORIA = {
  'Congelados': 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=800&q=80',
  'Dulce':      'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=80',
  'Mixtos':     'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
  'Bebidas':    'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80',
  'Combos':     'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
  'Acompanantes':'https://images.unsplash.com/photo-1541557435984-1c79685a082b?w=800&q=80',
  'default':    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
}

function getImgProducto(item) {
  if (item.imagenCliente) return item.imagenCliente
  if (item.imagen) return item.imagen
  return IMGS_CATEGORIA[item.categoria] || IMGS_CATEGORIA['default']
}

// ==========================================
// SELECTOR INICIAL
// ==========================================
function AppSelector({ onSelect }) {
  const [pwaListo, setPwaListo] = useState(false)
  const [instalada, setInstalada] = useState(() => { try { return window.matchMedia('(display-mode: standalone)').matches } catch { return false } })

  useEffect(() => {
    if (window.__pwaInstallPrompt) setPwaListo(true)
    const handler = () => setPwaListo(true)
    window.addEventListener('pwaInstallReady', handler)
    return () => window.removeEventListener('pwaInstallReady', handler)
  }, [])

  async function instalarApp() {
    const prompt = window.__pwaInstallPrompt
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setInstalada(true)
      setPwaListo(false)
    }
  }

  const [modalAcceso, setModalAcceso] = useState(false)

  return (
    <div style={{position:'fixed',inset:0,background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32}}>
      {/* LOGO ANIMADO */}
      <div style={{width:150,height:150,marginBottom:20}}>
        <style>{`
          @keyframes logoPulse {
            0%   { transform: scale(1);    filter: brightness(1); }
            45%  { transform: scale(1.07); filter: brightness(1.12); }
            55%  { transform: scale(1.07); filter: brightness(1.12); }
            100% { transform: scale(1);    filter: brightness(1); }
          }
          @keyframes logoEntrada {
            0%   { opacity:0; transform: scale(0.82); }
            100% { opacity:1; transform: scale(1); }
          }
          .logo-pulse {
            animation:
              logoEntrada 0.7s cubic-bezier(0.34,1.5,0.64,1) forwards,
              logoPulse 2.4s ease-in-out 0.7s infinite;
            transform-origin: center;
            display: block;
            width: 100%;
            height: 100%;
          }
        `}</style>
        <img src='/logo.png' alt='Esencial FC' className='logo-pulse'/>
      </div>

      <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:28,color:'#fff',letterSpacing:2,marginBottom:6}}>Esencial FC</h1>
      <div style={{width:40,height:2,background:'#7C9263',margin:'0 auto 40px'}}/>
      <div style={{display:'flex',flexDirection:'column',gap:14,width:'100%',maxWidth:320}}>
        {[
          {label:'Administracion', bg:'#fff', color:'#000', border:'none', action:()=>onSelect('admin')},
          {label:'Clientes', bg:'transparent', color:'#fff', border:'2px solid rgba(255,255,255,0.7)', action:()=>setModalAcceso(true)},
        ].map(b => (
          <button key={b.label} onClick={()=>{try{Sound.play('tap')}catch(e){}b.action()}} style={{
            padding:'18px 24px',background:b.bg,color:b.color,
            border:b.border,borderRadius:13,
            fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,letterSpacing:2,
            textTransform:'uppercase',cursor:'pointer',
            transition:'transform 0.13s ease, opacity 0.13s ease, box-shadow 0.18s ease',
            boxShadow: b.bg==='#fff' ? '0 4px 20px rgba(255,255,255,0.15)':'none'
          }}
          onMouseDown={e=>e.currentTarget.style.transform='scale(0.96)'}
          onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
          onTouchStart={e=>e.currentTarget.style.transform='scale(0.96)'}
          onTouchEnd={e=>e.currentTarget.style.transform='scale(1)'}
          >{b.label}</button>
        ))}
        {!instalada && pwaListo && (
          <button onClick={instalarApp} style={{
            padding:'16px 24px',background:'#2a5298',color:'#fff',border:'none',
            borderRadius:13,fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,
            letterSpacing:1,textTransform:'uppercase',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:10
          }}>
            <span style={{fontSize:18}}>📲</span> Instalar App
          </button>
        )}
        {instalada && (
          <div style={{textAlign:'center',fontSize:11,color:'#555',paddingTop:4,letterSpacing:1}}>
            ✓ App instalada
          </div>
        )}
      </div>
      <p style={{color:'#555',fontSize:11,letterSpacing:2,textTransform:'uppercase',marginTop:40}}>Selecciona tu tipo de acceso</p>

      {/* MODAL ACCESO CLIENTES */}
      {modalAcceso && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'flex-end'}}
          onClick={e=>{if(e.target===e.currentTarget)setModalAcceso(false)}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,margin:'0 auto',padding:'28px 24px 40px'}}>
            <div style={{width:40,height:4,background:'#e0e0e0',borderRadius:2,margin:'0 auto 24px'}}/>
            <img src='/logo.png' alt='Logo' style={{height:48,objectFit:'contain',display:'block',margin:'0 auto 12px'}}/>
            <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:20,textAlign:'center',marginBottom:6}}>Esencial FC</h2>
            <p style={{textAlign:'center',color:'#888',fontSize:12,fontFamily:'Poppins,sans-serif',marginBottom:28}}>¿Cómo deseas continuar?</p>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <button onClick={()=>{setModalAcceso(false);onSelect('cliente-registro')}} style={{
                padding:'16px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:12,
                fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,letterSpacing:1,
                textTransform:'uppercase',cursor:'pointer'
              }}>Registrarme</button>
              <button onClick={()=>{setModalAcceso(false);onSelect('cliente')}} style={{
                padding:'16px',background:'#fff',color:'#1a1a1a',
                border:'2px solid #1a1a1a',borderRadius:12,
                fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,letterSpacing:1,
                textTransform:'uppercase',cursor:'pointer'
              }}>Ingresar sin registrarme</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// REGISTRO CLIENTE
// ==========================================
function ClienteRegistro({ onRegistrado, onSinRegistro, onVolver }) {
  const [modo, setModo] = useState(null) // null | 'registro'
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [direccion, setDireccion] = useState('')
  const [referencia, setReferencia] = useState('')
  const [telefono, setTelefono] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  async function registrar() {
    if (!nombre) { setMsg('El nombre es obligatorio'); return }
    if (!direccion) { setMsg('La dirección es obligatoria'); return }
    if (!telefono) { setMsg('El teléfono es obligatorio'); return }
    setLoading(true); setMsg(null)
    const perfil = { nombre, cedula, direccion, referencia, telefono, creadoEn: new Date().toISOString() }
    try {
      await addDoc(collection(db,'clientes'), perfil)
      localStorage.setItem('esencial_cliente', JSON.stringify(perfil))
      onRegistrado(perfil)
    } catch(e) {
      // Guardar local si falla Firestore
      localStorage.setItem('esencial_cliente', JSON.stringify(perfil))
      onRegistrado(perfil)
    }
    setLoading(false)
  }

  if (!modo) return (
    <div style={{position:'fixed',inset:0,background:'#fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:28}}>
      <button onClick={onVolver} style={{position:'absolute',top:20,left:20,background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#999'}}>←</button>
      <img src='/logo.png' alt='Logo' style={{height:56,objectFit:'contain',marginBottom:14}}/>
      <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:26,fontWeight:700,marginBottom:6}}>Esencial FC</h2>
      <div style={{width:32,height:2,background:'#1a1a1a',margin:'0 auto 32px'}}/>
      <div style={{display:'flex',flexDirection:'column',gap:12,width:'100%',maxWidth:320}}>
        <button onClick={()=>setModo('registro')} style={{
          padding:'16px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:11,
          fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'
        }}>Registrarme</button>
        <button onClick={onSinRegistro} style={{
          padding:'16px',background:'#fff',color:'#1a1a1a',border:'2px solid #1a1a1a',borderRadius:11,
          fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'
        }}>Ingresar sin registrarme</button>
      </div>
    </div>
  )

  return (
    <div style={{position:'fixed',inset:0,background:'#fff',overflowY:'auto',padding:'24px 24px 40px'}}>
      <button onClick={()=>setModo(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#999',marginBottom:16}}>←</button>
      <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:24,fontWeight:700,marginBottom:4}}>Crear perfil</h2>
      <p style={{fontSize:12,color:'#999',marginBottom:24}}>Tus datos para entregas y pedidos</p>

      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Nombres *</label>
        <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder='Tu nombre completo'
          style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'12px 14px',outline:'none',color:'#1a1a1a'}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>ID / Cedula <span style={{color:'#bbb',fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional, para factura)</span></label>
        <input value={cedula} onChange={e=>setCedula(e.target.value)} placeholder='0000000000'
          style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'12px 14px',outline:'none',color:'#1a1a1a'}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Direccion * <span style={{color:'#bbb',fontWeight:400,textTransform:'none',letterSpacing:0}}>(ubicacion, lugar o barrio)</span></label>
        <input value={direccion} onChange={e=>setDireccion(e.target.value)} placeholder='Barrio Las Palmas, calle principal'
          style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'12px 14px',outline:'none',color:'#1a1a1a'}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Referencia <span style={{color:'#bbb',fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional)</span></label>
        <textarea value={referencia} onChange={e=>setReferencia(e.target.value)} placeholder='Casa azul, portón negro, junto al parque...'
          style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'12px 14px',outline:'none',color:'#1a1a1a',minHeight:60,resize:'vertical'}}/>
      </div>
      <div style={{marginBottom:20}}>
        <label style={{display:'block',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:6,fontWeight:600}}>Telefono *</label>
        <input value={telefono} onChange={e=>setTelefono(e.target.value)} placeholder='09XXXXXXXX' type='tel'
          style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'12px 14px',outline:'none',color:'#1a1a1a'}}/>
      </div>
      {msg && <div style={{background:'#ffebee',color:'#c62828',borderRadius:8,padding:'10px 14px',fontSize:12,marginBottom:14}}>{msg}</div>}
      <button onClick={registrar} disabled={loading} style={{
        width:'100%',padding:'15px',background: loading?'#e8e8e8':'#1a1a1a',color: loading?'#999':'#fff',
        border:'none',borderRadius:11,fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,
        letterSpacing:2,textTransform:'uppercase',cursor: loading?'not-allowed':'pointer'
      }}>{loading?'Guardando...':'Crear perfil'}</button>
    </div>
  )
}

// ==========================================
// APP CLIENTE
// ==========================================
function ClienteApp({ onVolver }) {
  const DOMICILIO_COSTO = 1.50
  const WA_NUM = '593996368109'
  const CUENTA = '2207515308'

  const [menu, setMenu] = useState([])
  const [promociones, setPromociones] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [indice, setIndice] = useState(0)
  const [catActiva, setCatActiva] = useState('Todos')
  const [cantidades, setCantidades] = useState({})
  const [modalPedido, setModalPedido] = useState(false)
  const [vistaCliente, setVistaCliente] = useState('menu') // 'menu' | 'pedido'
  const [modalRegistro, setModalRegistro] = useState(() => {
    const ir = localStorage.getItem('esencial_ir_registro')
    if (ir) { localStorage.removeItem('esencial_ir_registro'); return true }
    return false
  })
  const [modalImportante, setModalImportante] = useState(false)
  const [cliente, setCliente] = useState(() => {
    try { return JSON.parse(localStorage.getItem('esencial_cliente')) } catch { return null }
  })
  const [tmpNombre, setTmpNombre] = useState('')
  const [tmpTel, setTmpTel] = useState('')
  const [tmpDir, setTmpDir] = useState('')
  const [animDir, setAnimDir] = useState(null)
  const [imgError, setImgError] = useState({})
  const [copiado, setCopiado] = useState(null)
  const [modalPromos, setModalPromos] = useState(false)
  const [loadingGPS, setLoadingGPS] = useState(false)
  const [comprobanteCliente, setComprobanteCliente] = useState(null) // base64
  const [datosComprobanteCliente, setDatosComprobanteCliente] = useState(null)
  const [analizandoCompCliente, setAnalizandoCompCliente] = useState(false)
  const comprobanteRef = useRef(null)
  const [modalPerfilCliente, setModalPerfilCliente] = useState(false)
  const [modalHistorial, setModalHistorial] = useState(false)
  const [historialPedidos, setHistorialPedidos] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [fotoPerfilCliente, setFotoPerfilCliente] = useState(() => {
    try { return localStorage.getItem('esencial_foto_cliente') } catch { return null }
  })
  const fotoClienteRef = useRef(null)
  const promosMostradas = useRef(false)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  // Cargar menu + promociones en tiempo real
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db,'menu'), where('disponible','==',true)),
      snap => { setMenu(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoadingMenu(false) },
      () => setLoadingMenu(false)
    )
    const unsub2 = onSnapshot(collection(db,'promociones'), snap => {
      const hoy = (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
      const activas = snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.fecha===hoy)
      setPromociones(activas)
      // Abrir modal automaticamente solo la primera vez si hay promociones
      if (activas.length > 0 && !promosMostradas.current) {
        promosMostradas.current = true
        setModalPromos(true)
      }
    })
    return () => { unsub(); unsub2() }
  }, [])

  // Solo productos visibles para clientes
  const menuVisible = menu.filter(x => x.visibleClientes !== false)

  // Macro categorias - solo 3, sin subcategorias
  const MACRO = {
    'Todos':    null,
    'Frio':     ['Congelados','Bebidas'],
    'Caliente': ['Mixtos','Dulce'],
  }
  const [macroActiva, setMacroActiva] = useState('Todos')

  // Productos filtrados por macro
  const menuBaseFiltrado = macroActiva === 'Todos'
    ? menuVisible
    : menuVisible.filter(x => (MACRO[macroActiva]||[]).includes(x.categoria))

  // Orden especifico para categoria Todos
  const ORDEN_NOMBRES = ['hamburguesa hawaiana','hamburguesa','burrito','picadita','waffles','creps']
  function ordenarMenu(lista) {
    const ordenados = []
    const restantes = [...lista]
    ORDEN_NOMBRES.forEach(key => {
      const idx = restantes.findIndex(x => x.nombre?.toLowerCase().includes(key))
      if (idx !== -1) { ordenados.push(restantes.splice(idx, 1)[0]) }
    })
    return [...ordenados, ...restantes]
  }

  const menuFiltrado = macroActiva === 'Todos' ? ordenarMenu(menuBaseFiltrado) : menuBaseFiltrado
  const items = [...menuFiltrado]

  const prod = items[indice]

  const carrito = Object.entries(cantidades).filter(([,c])=>c>0).map(([id,cant])=>{
    const item = items.find(m=>m.id===id)
    return item ? {...item, cantidad:cant} : null
  }).filter(Boolean)
  const subtotal = carrito.reduce((s,x)=>s+parseFloat(x.precio)*x.cantidad,0)
  const total = subtotal + DOMICILIO_COSTO
  const totalItems = carrito.reduce((s,x)=>s+x.cantidad,0)

  function addCant(id, delta) {
    try{Sound.play(delta > 0 ? 'add' : 'remove')}catch(e){}
    setCantidades(p => {
      const v = Math.max(0, (p[id]||0) + delta)
      if (v === 0) { const n = {...p}; delete n[id]; return n }
      return {...p, [id]: v}
    })
  }

  function irA(newIdx) {
    if (newIdx < 0 || newIdx >= items.length) return
    setAnimDir(newIdx > indice ? 'left' : 'right')
    setIndice(newIdx)
    setTimeout(()=>setAnimDir(null), 350)
  }

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    if (Math.abs(dx) < 50 || dy > 80) return
    if (dx < 0) irA(indice+1)
    else irA(indice-1)
    touchStartX.current = null
  }

  function copiar(texto, key) {
    navigator.clipboard.writeText(texto).then(()=>{
      setCopiado(key)
      setTimeout(()=>setCopiado(null), 2000)
    })
  }

  async function analizarComprobanteCliente(base64) {
    setAnalizandoCompCliente(true)
    try {
      const comprimida = await comprimirImagen(base64)
      const mediaType = 'image/jpeg'
      const resp = await fetch('/api/analyze-comprobante', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ imageBase64: comprimida.split(',')[1], mediaType })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.detail?.error?.message || result.error || 'Error ' + resp.status)
      setDatosComprobanteCliente(result)
      showToast('ok','Comprobante analizado')
    } catch(e) {
      showToast('warn', e.message || 'No se pudo analizar')
    }
    setAnalizandoCompCliente(false)
  }

  async function cargarHistorial() {
    if (!cliente) return
    setLoadingHistorial(true)
    try {
      const q = query(
        collection(db,'domicilio'),
        where('telefono','==', cliente.telefono),
        orderBy('creadoEn','desc')
      )
      const snap = await getDocs(q)
      setHistorialPedidos(snap.docs.map(d => ({id:d.id, ...d.data()})))
    } catch(e) {
      // Si falla el orderBy (índice), intentar sin ordenar
      try {
        const q2 = query(collection(db,'domicilio'), where('telefono','==', cliente.telefono))
        const snap2 = await getDocs(q2)
        const lista = snap2.docs.map(d => ({id:d.id, ...d.data()}))
        lista.sort((a,b) => (b.creadoEn?.seconds||0) - (a.creadoEn?.seconds||0))
        setHistorialPedidos(lista)
      } catch(e2) { setHistorialPedidos([]) }
    }
    setLoadingHistorial(false)
  }

  function agregarDelHistorial(pedido) {
    if (!pedido.items?.length) return
    pedido.items.forEach(it => {
      // Buscar el producto en el menú actual para tener precio actualizado
      const prod = menu.find(m => m.nombre === it.nombre)
      if (!prod) return
      setCarrito(prev => {
        const existe = prev.find(c => c.id === prod.id)
        if (existe) return prev.map(c => c.id===prod.id ? {...c, cantidad: c.cantidad + it.cantidad} : c)
        return [...prev, {...prod, cantidad: it.cantidad}]
      })
    })
    setModalHistorial(false)
    setModalPerfilCliente(false)
    showToast('ok', `${pedido.items.length} productos agregados al carrito`)
  }

  async function confirmarEnvio() {
    const n = cliente?.nombre || tmpNombre
    const tel = cliente?.telefono || tmpTel
    if (!n || !tel) { showToast('warn','Completa nombre y telefono'); return }
    if (carrito.length===0) { showToast('warn','Agrega productos'); return }
    setModalImportante(true)
  }

  async function enviarWhatsApp() {
    const n = cliente?.nombre || tmpNombre
    const tel = cliente?.telefono || tmpTel
    const dir = cliente?.direccion || tmpDir

    // Guardar en Firestore coleccion domicilio
    const itemsData = carrito.map(x=>({nombre:x.nombre, cantidad:x.cantidad, precio:parseFloat(x.precio)}))
    try {
      const domData = {
        cliente: n, telefono: tel, direccion: dir,
        referencia: cliente?.referencia||'',
        items: itemsData, subtotal, total,
        estado: 'A DOMICILIO',
        creadoEn: serverTimestamp()
      }
      if (datosComprobanteCliente) domData.comprobante = datosComprobanteCliente
      await addDoc(collection(db,'domicilio'), domData)
    } catch(e) {}

    const lineas = carrito.map(x=>`  • ${x.cantidad}x ${x.nombre} — $${(parseFloat(x.precio)*x.cantidad).toFixed(2)}`).join('%0A')
    const msg = [
      '*PEDIDO A DOMICILIO - Esencial FC*',
      '----------------------------',
      '*Cliente:* ' + n,
      '*Telefono:* ' + tel,
      dir ? (dir.includes('maps.google') 
        ? '*Ubicacion GPS:* ' + dir 
        : '*Direccion:* ' + dir + (tmpDir && tmpDir.includes('maps.google') && tmpDir !== dir ? '%0A*Ubicacion GPS:* ' + tmpDir : '')) 
        : (tmpDir ? '*Ubicacion GPS:* ' + tmpDir : ''),
      datosComprobanteCliente ? '----------------------------' : '',
      datosComprobanteCliente ? '*Comprobante de Transferencia*' : '',
      datosComprobanteCliente?.monto ? '*Monto:* ' + datosComprobanteCliente.monto : '',
      datosComprobanteCliente?.remitente ? '*De:* ' + datosComprobanteCliente.remitente : '',
      datosComprobanteCliente?.fecha ? '*Fecha:* ' + datosComprobanteCliente.fecha : '',
      datosComprobanteCliente?.cuentaOrigen ? '*Cuenta Origen:* ' + datosComprobanteCliente.cuentaOrigen : '',
      datosComprobanteCliente?.nroComprobante ? '*N Comprobante:* ' + datosComprobanteCliente.nroComprobante : '',
      cliente?.referencia ? '*Referencia:* ' + cliente.referencia : '',
      cliente?.cedula ? '*Cedula:* ' + cliente.cedula : '',
      '----------------------------',
      '*Productos:*',
      lineas,
      '----------------------------',
      `*Subtotal: $${subtotal.toFixed(2)}*`,
      `*Envio: $${DOMICILIO_COSTO.toFixed(2)}*`,
      `*TOTAL: $${total.toFixed(2)}*`,
      '',
      'Enviado desde la app Esencial FC'
    ].filter(Boolean).join('%0A')

    try{Sound.play('success')}catch(e){}
    window.open(`https://wa.me/${WA_NUM}?text=${msg}`, '_blank')
    setModalImportante(false)
    setModalPedido(false)
    setCantidades({})
    setComprobanteCliente(null)
    setDatosComprobanteCliente(null)
    setVistaCliente('menu')
    showToast('ok','Pedido enviado por WhatsApp')
  }

  const imgSrc = prod ? (imgError[prod.id]
    ? (IMGS_CATEGORIA[prod.categoria]||IMGS_CATEGORIA['default'])
    : getImgProducto(prod)) : null

  if (loadingMenu) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:13}}>
      <div style={{width:32,height:32,border:'2px solid #d0d0d0',borderTopColor:'#1a1a1a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <p style={{color:'#999',fontSize:12}}>Cargando menu...</p>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#f7f7f7',display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto',position:'relative'}}>
      <style>{`
        @keyframes slideLeft{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideRight{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      {/* CONTENIDO PRINCIPAL (arriba del header fijo) */}
      <div style={{flex:1,overflowY:'auto',paddingBottom:130}}>

        {/* IMAGEN GRANDE CARRUSEL */}
        {prod ? (
          <div style={{position:'relative',background:'#111',userSelect:'none',aspectRatio:'1/1',maxHeight:'50vh',overflow:'hidden'}}
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <img
              key={prod.id}
              src={imgSrc}
              alt={prod.nombre}
              onError={()=>setImgError(p=>({...p,[prod.id]:true}))}
              style={{
                width:'100%',height:'100%',objectFit:'cover',display:'block',
                animation: animDir==='left'?'slideLeft 0.35s ease':animDir==='right'?'slideRight 0.35s ease':'none'
              }}
            />
            {prod._esPromo && (
              <div style={{position:'absolute',top:12,left:12,background:'#c62828',color:'#fff',padding:'4px 12px',borderRadius:100,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>
                Promocion
              </div>
            )}
            <div style={{position:'absolute',bottom:0,left:0,right:0,height:80,background:'linear-gradient(transparent,rgba(0,0,0,0.65))'}}/>
            {/* Indicadores */}
            <div style={{position:'absolute',bottom:12,left:0,right:0,display:'flex',justifyContent:'center',gap:5,flexWrap:'wrap',padding:'0 20px'}}>
              {items.map((_,i)=>(
                <div key={i} onClick={()=>irA(i)} style={{
                  width:i===indice?18:6,height:6,borderRadius:3,cursor:'pointer',transition:'0.3s',
                  background:i===indice?'#fff':'rgba(255,255,255,0.35)'
                }}/>
              ))}
            </div>
            {indice>0 && <button onClick={()=>irA(indice-1)} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.4)',border:'none',color:'#fff',width:38,height:38,borderRadius:'50%',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>}
            {indice<items.length-1 && <button onClick={()=>irA(indice+1)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.4)',border:'none',color:'#fff',width:38,height:38,borderRadius:'50%',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>}
          </div>
        ) : (
          <div style={{aspectRatio:'1/1',maxHeight:'50vh',background:'#e0e0e0',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{color:'#bbb',fontSize:13}}>Sin productos disponibles</span>
          </div>
        )}

        {/* CATEGORIAS + BOTON PROMOCIONES */}
        <div style={{background:'#fff',borderBottom:'1px solid #e0e0e0'}}>
          {/* 3 tabs principales */}
          <div style={{display:'flex',gap:0}}>
            {[
              {key:'Todos',    color:'#7C9263'},
              {key:'Frio',     color:'#1565c0'},
              {key:'Caliente', color:'#e65100'},
            ].map(({key,color}) => {
              const activo = macroActiva === key
              return (
                <button key={key} onClick={()=>{setMacroActiva(key);setIndice(0)}} style={{
                  flex:1,padding:'11px 6px',border:'none',
                  borderBottom: activo?`3px solid ${color}`:'3px solid transparent',
                  fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1,
                  textTransform:'uppercase',cursor:'pointer',transition:'0.2s',background:'#fff',
                  color: activo ? color : '#bbb'
                }}>{key}</button>
              )
            })}
          </div>
          {/* Botón Promociones */}
          <div style={{padding:'8px 12px'}}>
            <button onClick={()=>setModalPromos(true)} style={{
              display:'flex',alignItems:'center',gap:8,padding:'8px 16px',
              background: promociones.length>0 ? '#7C9263' : '#f4f4f4',
              color: promociones.length>0 ? '#fff' : '#bbb',
              border:'none',borderRadius:100,fontFamily:'Poppins,sans-serif',
              fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',
              cursor:'pointer',position:'relative'
            }}>
              Promociones
              {promociones.length > 0 && (
                <span style={{background:'#c62828',color:'#fff',borderRadius:100,minWidth:18,height:18,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}}>
                  {promociones.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* DETALLE PRODUCTO */}
        {prod && (
          <div key={prod.id} style={{background:'#fff',margin:'8px 12px 0',borderRadius:14,padding:'16px',border:'1px solid #e0e0e0',boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
            animation:animDir==='left'?'slideLeft 0.35s ease':animDir==='right'?'slideRight 0.35s ease':'none'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6}}>
              <div style={{flex:1}}>
                <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:20,fontWeight:700,color:'#1a1a1a',marginBottom:6}}>{prod.nombre}</h2>
                <span style={{background:prod._esPromo?'#c62828':'#1a1a1a',color:'#fff',fontSize:9,fontWeight:700,letterSpacing:1,textTransform:'uppercase',padding:'3px 9px',borderRadius:100}}>
                  {prod._esPromo ? 'Promocion' : prod.categoria}
                </span>
              </div>
              <span style={{fontFamily:'Poppins,sans-serif',fontSize:26,color:'#1a1a1a',fontWeight:700,marginLeft:12}}>${parseFloat(prod.precio).toFixed(2)}</span>
            </div>
            {prod.descripcion && <p style={{fontSize:13,color:'#666',lineHeight:1.6,marginTop:10}}>{prod.descripcion}</p>}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:14,paddingTop:14,borderTop:'1px solid #e0e0e0'}}>
              <span style={{fontSize:12,fontWeight:600,color:'#666',letterSpacing:1,textTransform:'uppercase'}}>Cantidad</span>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>addCant(prod.id,-1)} style={{width:34,height:34,borderRadius:'50%',border:'2px solid #d0d0d0',background:'#fff',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#666'}}>-</button>
                <span style={{fontSize:18,fontWeight:700,minWidth:24,textAlign:'center'}}>{cantidades[prod.id]||0}</span>
                <button onClick={()=>addCant(prod.id,1)} style={{width:34,height:34,borderRadius:'50%',border:'none',background:'#1a1a1a',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>+</button>
              </div>
            </div>
          </div>
        )}

        {/* RESUMEN PEDIDO */}
        <div style={{background:'#fff',margin:'10px 12px 0',borderRadius:14,padding:'14px 16px',border:'1px solid #e0e0e0',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
          <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600,marginBottom:10}}>Tu pedido</div>
          {carrito.length===0 ? (
            <p style={{fontSize:12,color:'#ccc',textAlign:'center',padding:'10px 0'}}>Desliza y agrega productos</p>
          ) : (
            <>
              {carrito.map(x=>(
                <div key={x.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #f0f0f0'}}>
                  <div style={{flex:1}}>
                    <span style={{fontSize:12,color:'#1a1a1a',fontWeight:500}}>{x.nombre}</span>
                    <span style={{fontSize:11,color:'#999',marginLeft:8}}>x{x.cantidad}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:13,fontWeight:600}}>${(parseFloat(x.precio)*x.cantidad).toFixed(2)}</span>
                    <button onClick={()=>addCant(x.id,-x.cantidad)} style={{background:'none',border:'none',color:'#ccc',fontSize:16,cursor:'pointer'}}>×</button>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'8px 0 4px',borderTop:'1px solid #e0e0e0',marginTop:6}}>
                <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'4px 0'}}>
                <span>Envio a domicilio</span><span>${DOMICILIO_COSTO.toFixed(2)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:8,borderTop:'1.5px solid #d0d0d0',marginTop:4}}>
                <span style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#666',fontWeight:600}}>Total</span>
                <span style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:700}}>${total.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* HEADER FIJO ABAJO */}
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,zIndex:200}}>
        {/* Barra nombre + perfil */}
        <div style={{background:'#1a1a1a',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <img src='/logo.png' alt='logo' style={{height:26,width:26,objectFit:'contain',borderRadius:3,flexShrink:0}}/>
            <span style={{fontFamily:'Poppins,sans-serif',fontSize:14,fontWeight:700,color:'#fff',letterSpacing:2}}>Esencial FC</span>
          </div>
          <button onClick={()=>setModalPerfilCliente(true)} style={{display:'flex',alignItems:'center',gap:7,background:'#333',border:'1px solid #555',borderRadius:20,padding:'5px 10px 5px 6px',cursor:'pointer'}}>
            <div style={{width:24,height:24,borderRadius:'50%',background:'#555',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{color:'#ccc',fontSize:11,fontWeight:700}}>{cliente?cliente.nombre?.charAt(0)?.toUpperCase():'U'}</span>
            </div>
            <span style={{color:'#ccc',fontSize:11,fontWeight:600,maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {cliente ? cliente.nombre?.split(' ')[0] : 'Usuario'}
            </span>
          </button>
        </div>
        {/* Nav inferior MENÚ / PEDIDO */}
        <div style={{background:'#fff',borderTop:'1.5px solid #e0e0e0',boxShadow:'0 -4px 16px rgba(0,0,0,0.08)',display:'flex'}}>
          <button onClick={()=>setVistaCliente('menu')} style={{
            flex:1,padding:'14px 0',background:'none',border:'none',cursor:'pointer',
            borderBottom: vistaCliente==='menu' ? '2.5px solid #7C9263' : '2.5px solid transparent'
          }}>
            <span style={{fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,letterSpacing:1.5,
              color:vistaCliente==='menu'?'#7C9263':'#aaa'}}>MENÚ</span>
          </button>
          <button onClick={()=>setVistaCliente('pedido')} style={{
            flex:1,padding:'14px 0',background:'none',border:'none',cursor:'pointer',position:'relative',
            borderBottom: vistaCliente==='pedido' ? '2.5px solid #1a1a1a' : '2.5px solid transparent'
          }}>
            {totalItems>0 && (
              <span style={{position:'absolute',top:6,right:'calc(50% - 22px)',background:'#e53935',color:'#fff',
                borderRadius:'50%',width:16,height:16,fontSize:9,fontWeight:700,
                display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{totalItems}</span>
            )}
            <span style={{fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,letterSpacing:1.5,
              color:vistaCliente==='pedido'?'#1a1a1a':'#aaa'}}>PEDIDO</span>
          </button>
        </div>
      </div>

      {/* MODAL PERFIL CLIENTE */}
      {modalPerfilCliente && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'flex-end'}}
          onClick={e=>{if(e.target===e.currentTarget)setModalPerfilCliente(false)}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,margin:'0 auto',padding:'24px 20px 36px'}}>
            <div style={{width:40,height:4,background:'#e0e0e0',borderRadius:2,margin:'0 auto 20px'}}/>
            {cliente ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,paddingBottom:16,borderBottom:'1px solid #e0e0e0'}}>
                  <div onClick={()=>fotoClienteRef.current?.click()} style={{
                    width:52,height:52,borderRadius:'50%',background:'#1a1a1a',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    flexShrink:0,cursor:'pointer',overflow:'hidden',position:'relative',
                    border:`2px solid #7C9263`
                  }}>
                    {fotoPerfilCliente
                      ? <img src={fotoPerfilCliente} alt='perfil' style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      : <span style={{color:'#fff',fontSize:20,fontWeight:700}}>{cliente.nombre?.charAt(0)?.toUpperCase()}</span>
                    }
                    <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.45)',fontSize:8,color:'#fff',textAlign:'center',padding:'2px',fontFamily:'Poppins,sans-serif'}}>editar</div>
                  </div>
                  <input type='file' accept='image/*' style={{display:'none'}} ref={fotoClienteRef}
                    onChange={e=>{
                      const file=e.target.files?.[0]
                      if(!file) return
                      const reader=new FileReader()
                      reader.onload=ev=>{
                        const img=new window.Image()
                        img.onload=()=>{
                          const MAX=200
                          const scale=Math.min(MAX/img.width,MAX/img.height,1)
                          const canvas=document.createElement('canvas')
                          canvas.width=Math.round(img.width*scale)
                          canvas.height=Math.round(img.height*scale)
                          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height)
                          const compressed=canvas.toDataURL('image/jpeg',0.72)
                          setFotoPerfilCliente(compressed)
                          try{localStorage.setItem('esencial_foto_cliente',compressed)}catch(err){}
                        }
                        img.src=ev.target.result
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <div>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16}}>{cliente.nombre}</div>
                    <div style={{fontSize:12,color:'#888',marginTop:2}}>Cliente registrado</div>
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
                  {cliente.telefono && <div style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>📱 {cliente.telefono}</div>}
                  {cliente.direccion && <div style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>📍 {cliente.direccion}</div>}
                  {cliente.cedula && <div style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>🪪 {cliente.cedula}</div>}
                </div>
              </>
            ) : (
              <div style={{textAlign:'center',padding:'16px 0 20px'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'#f4f4f4',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                  <span style={{fontSize:24}}>👤</span>
                </div>
                <div style={{fontFamily:'Poppins,sans-serif',fontWeight:600,fontSize:15,marginBottom:4}}>Usuario</div>
                <div style={{fontSize:12,color:'#aaa',marginBottom:16}}>No registrado</div>
                <button onClick={()=>{setModalPerfilCliente(false);setModalRegistro(true)}} style={{
                  padding:'10px 24px',background:'#1a1a1a',color:'#fff',border:'none',
                  borderRadius:10,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'
                }}>Registrarme</button>
              </div>
            )}
            {cliente && (
              <button onClick={()=>{cargarHistorial();setModalHistorial(true)}} style={{
                width:'100%',padding:'12px',background:'#7C9263',color:'#fff',
                border:'none',borderRadius:10,
                fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:8,
                display:'flex',alignItems:'center',justifyContent:'center',gap:8
              }}>
                <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'>
                  <path d='M9 11l3 3L22 4'/><path d='M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'/>
                </svg>
                Mis Pedidos
              </button>
            )}
            <button onClick={()=>{setModalPerfilCliente(false);localStorage.removeItem('esencial_modo');window.location.reload()}} style={{
              width:'100%',padding:'12px',background:'#f4f4f4',color:'#1a1a1a',
              border:'1px solid #e0e0e0',borderRadius:10,
              fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer',marginTop:4
            }}>← Regresar a Inicio</button>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL DE PEDIDOS */}
      {modalHistorial && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:1100,display:'flex',alignItems:'flex-end'}}
          onClick={e=>{if(e.target===e.currentTarget)setModalHistorial(false)}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,margin:'0 auto',maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px 0',flexShrink:0}}>
              <div style={{width:40,height:4,background:'#e0e0e0',borderRadius:2,margin:'0 auto 16px'}}/>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16}}>Mis Pedidos</div>
                <button onClick={()=>setModalHistorial(false)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#999'}}>×</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'0 20px 24px'}}>
              {loadingHistorial ? (
                <div style={{textAlign:'center',padding:40,color:'#999',fontFamily:'Poppins,sans-serif',fontSize:13}}>Cargando...</div>
              ) : historialPedidos.length === 0 ? (
                <div style={{textAlign:'center',padding:40}}>
                  <div style={{fontSize:32,marginBottom:12}}>📦</div>
                  <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,color:'#999'}}>Aún no tienes pedidos registrados</div>
                </div>
              ) : (
                historialPedidos.map((ped, idx) => (
                  <div key={ped.id} style={{border:'1px solid #e0e0e0',borderRadius:12,marginBottom:12,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    <div style={{background:'#f8f8f8',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #e0e0e0'}}>
                      <div>
                        <div style={{fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,color:'#1a1a1a'}}>
                          Pedido #{idx + 1}
                        </div>
                        <div style={{fontSize:10,color:'#999',marginTop:1}}>
                          {ped.creadoEn?.toDate?.()?.toLocaleDateString('es-EC',{day:'2-digit',month:'short',year:'numeric'}) || ''}
                        </div>
                      </div>
                      <div style={{fontFamily:'Poppins,sans-serif',fontSize:14,fontWeight:700,color:'#7C9263'}}>
                        ${parseFloat(ped.total||0).toFixed(2)}
                      </div>
                    </div>
                    <div style={{padding:'10px 14px'}}>
                      {ped.items?.slice(0,3).map((it,j) => (
                        <div key={j} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#555',padding:'2px 0'}}>
                          <span>{it.cantidad}x {it.nombre}</span>
                          <span>${(it.precio*it.cantidad).toFixed(2)}</span>
                        </div>
                      ))}
                      {ped.items?.length > 3 && (
                        <div style={{fontSize:11,color:'#999',marginTop:2}}>+{ped.items.length-3} más...</div>
                      )}
                      {ped.direccion && (
                        <div style={{fontSize:11,color:'#888',marginTop:6,display:'flex',gap:4,alignItems:'center'}}>
                          <span>📍</span>
                          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ped.direccion}</span>
                        </div>
                      )}
                    </div>
                    <div style={{padding:'0 14px 12px'}}>
                      <button onClick={()=>agregarDelHistorial(ped)} style={{
                        width:'100%',padding:'9px',background:'#7C9263',color:'#fff',
                        border:'none',borderRadius:8,fontFamily:'Poppins,sans-serif',
                        fontSize:11,fontWeight:700,letterSpacing:0.5,cursor:'pointer',
                        display:'flex',alignItems:'center',justifyContent:'center',gap:6
                      }}>
                        <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'>
                          <path d='M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m13-9l2 9m-5-9v9m-4-9v9'/>
                        </svg>
                        Agregar al carrito
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROMOCIONES CLIENTES */}
      {modalPromos && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'flex-end'}}
          onClick={e=>{if(e.target===e.currentTarget)setModalPromos(false)}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,margin:'0 auto',maxHeight:'88vh',overflowY:'auto',padding:'20px 20px 36px'}}>
            <div style={{width:40,height:4,background:'#e0e0e0',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div>
                <h3 style={{fontFamily:'Poppins,sans-serif',fontSize:20}}>Promociones</h3>
                <p style={{fontSize:11,color:'#999',marginTop:2}}>Solo por hoy</p>
              </div>
              <button onClick={()=>setModalPromos(false)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#bbb'}}>×</button>
            </div>
            {promociones.length === 0 ? (
              <div style={{textAlign:'center',padding:'30px 0',color:'#999',fontSize:13}}>Sin promociones activas hoy</div>
            ) : promociones.map(p => (
              <div key={p.id} style={{border:'2px solid #1a1a1a',borderRadius:13,overflow:'hidden',marginBottom:14}}>
                {p.imagen && <img src={p.imagen} alt={p.nombre} style={{width:'100%',height:160,objectFit:'cover',display:'block'}}/>}
                <div style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:16,color:'#1a1a1a'}}>{p.nombre}</div>
                      {p.descripcion && <div style={{fontSize:12,color:'#666',marginTop:4,lineHeight:1.5}}>{p.descripcion}</div>}
                    </div>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:20,fontWeight:700,color:'#1a1a1a',marginLeft:12}}>${parseFloat(p.precio).toFixed(2)}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,paddingTop:12,borderTop:'1px solid #e0e0e0'}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#666',letterSpacing:1,textTransform:'uppercase'}}>Cantidad</span>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <button onClick={()=>addCant(p.id,-1)} style={{width:34,height:34,borderRadius:'50%',border:'2px solid #d0d0d0',background:'#fff',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#666'}}>-</button>
                      <span style={{fontSize:18,fontWeight:700,minWidth:24,textAlign:'center'}}>{cantidades[p.id]||0}</span>
                      <button onClick={()=>addCant(p.id,1)} style={{width:34,height:34,borderRadius:'50%',border:'none',background:'#1a1a1a',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>+</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={()=>setModalPromos(false)} style={{
              width:'100%',padding:'13px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:11,
              fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,letterSpacing:2,
              textTransform:'uppercase',cursor:'pointer',marginTop:4
            }}>Ver menu completo</button>
          </div>
        </div>
      )}

      {/* VISTA PEDIDO */}
      {vistaCliente==='pedido' && (
        <div style={{position:'fixed',inset:0,background:'#fff',zIndex:500,display:'flex',flexDirection:'column',paddingBottom:70}}>
          <div style={{background:'#fff',padding:'14px 16px 10px',borderBottom:'1px solid #e0e0e0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <h3 style={{fontFamily:'Poppins,sans-serif',fontSize:17,fontWeight:700}}>Tu pedido</h3>
            {totalItems>0 && <span style={{background:'#1a1a1a',color:'#fff',borderRadius:100,padding:'3px 10px',fontSize:11,fontWeight:700}}>{totalItems} items</span>}
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'16px 16px 0'}}>

            {/* Productos */}
            <div style={{background:'#f8f8f8',borderRadius:11,padding:'12px 14px',marginBottom:12}}>
              {carrito.map(x=>(
                <div key={x.id} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px solid #eee'}}>
                  <span>{x.cantidad}x {x.nombre}</span>
                  <span style={{fontWeight:600}}>${(parseFloat(x.precio)*x.cantidad).toFixed(2)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'8px 0 4px',borderTop:'1px solid #ddd',marginTop:6}}>
                <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#666',padding:'4px 0'}}>
                <span>Entrega a domicilio</span><span>${DOMICILIO_COSTO.toFixed(2)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:9,marginTop:4,borderTop:'1.5px solid #d0d0d0'}}>
                <span style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#666'}}>Total</span>
                <span style={{fontFamily:'Poppins,sans-serif',fontSize:20,fontWeight:700}}>${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Cuenta bancaria */}
            <div style={{background:'#f0f4ff',border:'1px solid #c5d0e8',borderRadius:11,padding:'14px',marginBottom:12}}>
              <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#555',fontWeight:600,marginBottom:10}}>Datos de pago</div>
              <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:6}}>Cuenta Pichincha Ahorros</div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:15,fontWeight:700,letterSpacing:1,color:'#1a1a1a'}}>{CUENTA}</span>
                <button onClick={()=>copiar(CUENTA,'cuenta')} style={{background:'#1a1a1a',color:'#fff',border:'none',borderRadius:7,padding:'5px 12px',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'Poppins,sans-serif'}}>
                  {copiado==='cuenta'?'Copiado':'Copiar'}
                </button>
              </div>
              <div style={{borderTop:'1px solid #c5d0e8',paddingTop:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:13,color:'#444'}}>WhatsApp: 0996368109</span>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>copiar('0996368109','tel')} style={{background:'#fff',color:'#1a1a1a',border:'1px solid #c5d0e8',borderRadius:7,padding:'5px 10px',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'Poppins,sans-serif'}}>
                    {copiado==='tel'?'Copiado':'Copiar'}
                  </button>
                  <button onClick={()=>window.open(`https://wa.me/${WA_NUM}`,'_blank')} style={{background:'#25d366',color:'#fff',border:'none',borderRadius:7,padding:'5px 10px',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'Poppins,sans-serif'}}>
                    WA
                  </button>
                </div>
              </div>
            </div>

            {/* Datos cliente */}
            <div style={{background:'#f8f8f8',borderRadius:11,padding:'14px',marginBottom:16}}>
              <div style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'#999',fontWeight:600,marginBottom:10}}>Tus datos</div>
              {cliente ? (
                <>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:3}}>{cliente.nombre}</div>
                  <div style={{fontSize:12,color:'#666',marginBottom:2}}>{cliente.telefono}</div>
                  <div style={{fontSize:12,color:'#666'}}>{cliente.direccion}</div>
                  {cliente.referencia && <div style={{fontSize:12,color:'#999',marginTop:2}}>{cliente.referencia}</div>}
                  <button type='button' onClick={async ()=>{
                    if (!navigator.geolocation){ showToast('err','GPS no disponible'); return }
                    setLoadingGPS(true)
                    navigator.geolocation.getCurrentPosition(
                      pos=>{
                        const lat=pos.coords.latitude.toFixed(6)
                        const lng=pos.coords.longitude.toFixed(6)
                        const link=`https://maps.google.com/?q=${lat},${lng}`
                        showToast('ok','Ubicacion lista — se incluira en el pedido')
                        setTmpDir(link)
                        setLoadingGPS(false)
                      },
                      ()=>{ setLoadingGPS(false); showToast('err','No se pudo obtener ubicacion') },
                      {enableHighAccuracy:true,timeout:12000}
                    )
                  }} style={{
                    width:'100%',marginTop:8,padding:'8px 14px',
                    background:loadingGPS?'#f0f0f0':'#f5f8f1',
                    border:`1.5px solid #7C9263`,borderRadius:8,cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',gap:7,
                    fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,
                    color:loadingGPS?'#aaa':'#7C9263'
                  }}>
                    <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'>
                      <circle cx='12' cy='12' r='3'/><line x1='12' y1='2' x2='12' y2='6'/><line x1='12' y1='18' x2='12' y2='22'/>
                      <line x1='2' y1='12' x2='6' y2='12'/><line x1='18' y1='12' x2='22' y2='12'/>
                    </svg>
                    {loadingGPS?'Obteniendo ubicacion...':'Enviar mi ubicacion actual'}
                  </button>
                  {tmpDir && tmpDir.includes('maps.google') && (
                    <div style={{fontSize:10,color:'#7C9263',marginTop:4,fontWeight:600}}>Ubicacion GPS incluida en el pedido</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{marginBottom:10}}>
                    <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Nombre *</label>
                    <input value={tmpNombre} onChange={e=>setTmpNombre(e.target.value)} placeholder='Tu nombre'
                      style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'9px 12px',outline:'none'}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Telefono *</label>
                    <input value={tmpTel} onChange={e=>setTmpTel(e.target.value)} placeholder='09XXXXXXXX' type='tel'
                      style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'9px 12px',outline:'none'}}/>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#999',marginBottom:5,fontWeight:600}}>Direccion</label>
                    <input value={tmpDir} onChange={e=>setTmpDir(e.target.value)} placeholder='Barrio o lugar de entrega'
                      style={{width:'100%',border:'1.5px solid #d0d0d0',borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'9px 12px',outline:'none'}}/>
                    <button type='button' onClick={async ()=>{
                      if (!navigator.geolocation){ showToast('err','GPS no disponible'); return }
                      setLoadingGPS(true)
                      navigator.geolocation.getCurrentPosition(
                        pos=>{
                          const lat=pos.coords.latitude.toFixed(6)
                          const lng=pos.coords.longitude.toFixed(6)
                          const link=`https://maps.google.com/?q=${lat},${lng}`
                          setTmpDir(prev=>prev?`${prev} ${link}`:link)
                          setLoadingGPS(false)
                          showToast('ok','Ubicacion agregada')
                        },
                        ()=>{ setLoadingGPS(false); showToast('err','No se pudo obtener la ubicacion. Activa el GPS') },
                        {enableHighAccuracy:true,timeout:12000}
                      )
                    }} style={{
                      width:'100%',marginTop:6,padding:'9px 14px',
                      background:loadingGPS?'#f0f0f0':'#f5f8f1',
                      border:`1.5px solid #7C9263`,borderRadius:8,cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:7,
                      fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,
                      color:loadingGPS?'#aaa':'#7C9263'
                    }}>
                      <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'>
                        <circle cx='12' cy='12' r='3'/><line x1='12' y1='2' x2='12' y2='6'/><line x1='12' y1='18' x2='12' y2='22'/>
                        <line x1='2' y1='12' x2='6' y2='12'/><line x1='18' y1='12' x2='22' y2='12'/>
                      </svg>
                      {loadingGPS ? 'Obteniendo ubicacion...' : 'Usar mi ubicacion actual'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Adjuntar Comprobante */}
            <div style={{background:'#f5f8f1',border:`1.5px solid #7C9263`,borderRadius:11,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:11,color:'#555',fontFamily:'Poppins,sans-serif',fontWeight:600,marginBottom:4,textAlign:'center'}}>
                Adjunta el Comprobante aqui, tu pedido sera mas rapido
              </div>
              <input type='file' accept='image/*' style={{display:'none'}} ref={comprobanteRef}
                onChange={e=>{
                  const file=e.target.files?.[0]
                  if(!file) return
                  const reader=new FileReader()
                  reader.onload=ev=>{
                    const b64=ev.target.result
                    setComprobanteCliente(b64)
                    analizarComprobanteCliente(b64)
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
              {comprobanteCliente ? (
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <div style={{width:44,height:44,borderRadius:7,overflow:'hidden',border:`1px solid #7C9263`,flexShrink:0}}>
                      <img src={comprobanteCliente} alt='comp' style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    </div>
                    <div style={{flex:1}}>
                      {analizandoCompCliente ? (
                        <div style={{fontSize:11,color:'#7C9263',fontWeight:600}}>Analizando comprobante...</div>
                      ) : datosComprobanteCliente?.monto ? (
                        <div>
                          <div style={{fontSize:11,color:'#1a1a1a',fontWeight:700}}>{datosComprobanteCliente.monto}</div>
                          <div style={{fontSize:10,color:'#666'}}>{datosComprobanteCliente.remitente}</div>
                          <div style={{fontSize:10,color:'#999'}}>N° {datosComprobanteCliente.nroComprobante}</div>
                        </div>
                      ) : (
                        <div style={{fontSize:11,color:'#999'}}>Comprobante adjunto</div>
                      )}
                    </div>
                    <button onClick={()=>{setComprobanteCliente(null);setDatosComprobanteCliente(null)}} style={{background:'none',border:'none',color:'#c62828',fontSize:18,cursor:'pointer',lineHeight:1}}>x</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>comprobanteRef.current?.click()} style={{
                  width:'100%',padding:'9px',background:'#fff',border:`1.5px dashed #7C9263`,
                  borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,
                  color:'#7C9263',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7
                }}>
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg>
                  Adjuntar Comprobante
                </button>
              )}
            </div>

          </div>
          {/* Botón WA fijo en fondo */}
          <div style={{padding:'10px 16px 16px',borderTop:'1px solid #e0e0e0',background:'#fff',display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={confirmarEnvio} style={{
              width:'100%',padding:'15px',background:'#25d366',color:'#fff',border:'none',borderRadius:11,
              fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'
            }}>Enviar pedido por WhatsApp</button>
            <button onClick={()=>{setCantidades({});setComprobanteCliente(null);setDatosComprobanteCliente(null);setVistaCliente('menu')}} style={{
              width:'100%',padding:'12px',background:'#fff',color:'#c62828',border:'1.5px solid #ffcdd2',borderRadius:11,
              fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,letterSpacing:2,textTransform:'uppercase',cursor:'pointer'
            }}>Cancelar pedido</button>
          </div>
        </div>
      )}

      {/* MODAL IMPORTANTE */}
      {modalImportante && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',borderRadius:16,padding:'28px 24px',maxWidth:340,width:'100%'}}>
            <div style={{fontSize:10,letterSpacing:3,textTransform:'uppercase',fontWeight:700,color:'#c62828',marginBottom:10}}>Importante</div>
            <h3 style={{fontFamily:'Poppins,sans-serif',fontSize:18,marginBottom:12}}>Antes de enviar</h3>
            <p style={{fontSize:13,color:'#555',lineHeight:1.7,marginBottom:20}}>
              Se enviara tu pedido por WhatsApp pero debes <strong>adjuntar el comprobante de la transferencia</strong> y enviarlo a los datos indicados. Si no lo haces, tu pedido tardara mas en procesarse.
            </p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setModalImportante(false)} style={{flex:1,padding:'12px',background:'#fff',color:'#666',border:'1.5px solid #d0d0d0',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <button onClick={enviarWhatsApp} style={{flex:2,padding:'12px',background:'#25d366',color:'#fff',border:'none',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'}}>Aceptar y enviar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRO */}
      {modalRegistro && (
        <div style={{position:'fixed',inset:0,zIndex:3000}}>
          <ClienteRegistro
            onRegistrado={(p)=>{setCliente(p);setModalRegistro(false);showToast('ok','Perfil guardado')}}
            onSinRegistro={()=>setModalRegistro(false)}
            onVolver={()=>setModalRegistro(false)}
          />
        </div>
      )}

      <Toast/>
    </div>
  )
}

// ==========================================
// APP WRAPPER - PUNTO DE ENTRADA
// ==========================================
export default function App() {
  const [modo, setModo] = useState(() => localStorage.getItem('esencial_modo') || null)

  function seleccionar(m) {
    if (m === 'cliente-registro') {
      localStorage.setItem('esencial_modo', 'cliente')
      localStorage.setItem('esencial_ir_registro', '1')
      setModo('cliente')
    } else {
      localStorage.setItem('esencial_modo', m)
      localStorage.removeItem('esencial_ir_registro')
      setModo(m)
    }
  }

  function volver() {
    localStorage.removeItem('esencial_modo')
    setModo(null)
  }

  if (!modo) return <><style>{G}</style><AppSelector onSelect={seleccionar}/></>
  if (modo === 'cliente') return <><style>{G}</style><ClienteApp onVolver={volver}/></>
  return <AdminApp/>
}