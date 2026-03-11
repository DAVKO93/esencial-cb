import { useState, useEffect, useRef } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db, auth, storage } from './firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, signInAnonymously
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
    } else if (type === 'newOrder') {
      // Pedido domicilio nuevo — doble beep urgente
      [0, 0.22].forEach(delay => {
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain()
        o2.connect(g2); g2.connect(ctx.destination)
        o2.type = 'sine'; o2.frequency.setValueAtTime(880, now + delay)
        g2.gain.setValueAtTime(0.1, now + delay)
        g2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18)
        o2.start(now + delay); o2.stop(now + delay + 0.18)
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

function AdminApp({ onVerComoCliente }) {
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
  const [modalComprobante, setModalComprobante] = useState(null) // url de imagen
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

  // ── HISTORY API admin — evita cierre accidental con gesto retroceso ──
  useEffect(() => {
    window.history.pushState({ admin: 'init' }, '')
    const handleBack = () => {
      window.history.pushState({ admin: tab }, '')
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

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
        // Sonido cuando llega nuevo pedido a domicilio
        if (hoy.length > (pedidosDomicilioHoy?.length || 0)) {
          try { Sound.play('newOrder') } catch(e) {}
        }
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
    const urlFoto = fotoComprobante[id]
    const updateData = {
      estado:'LISTO',
      formaPago,
      tipoCliente: dc.tipo==='cliente' ? 'Cliente' : dc.tipo==='final' ? 'Consumidor Final' : 'Pendiente',
      idDocumento: dc.id || '',
      cliente: dc.tipo==='cliente' ? (dc.nombre||'Sin nombre') : dc.tipo==='final' ? 'Consumidor Final' : 'Pendiente',
      telefono: dc.tel || '',
      email: dc.email || '',
      ...(urlFoto ? { urlComprobante: urlFoto } : {}),
    }

    // Quitar inmediatamente de EN PROCESO
    setPedidosActivos(p => p.filter(x => x.id !== id))
    setPagoSel(p => { const n={...p}; delete n[id]; return n })
    setFotoComprobante(p => { const n={...p}; delete n[id]; return n })

    setDatosCliente(p => { const n={...p}; delete n[id]; return n })
    try {
      await updateDoc(doc(db,'pedidos',id), updateData)
      // Registrar venta completada con productos
      const pedidoCompletado = pedidosActivos.find(x => x.id === id)
      if (pedidoCompletado) {
        registrarEvento('venta_completada', {
          origen: 'admin_mesa',
          mesa: pedidoCompletado.mesa || '',
          items: (pedidoCompletado.items||[]).map(x=>({nombre:x.nombre, cantidad:x.cantidad, precio:x.precio})),
          total: pedidoCompletado.total || 0,
          formaPago
        })
      }
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
      const pedidoElim = pedidosActivos.find(x => x.id === idEliminar)
      registrarEvento('pedido_cancelado', {
        origen: 'admin_mesa',
        mesa: pedidoElim?.mesa || '',
        items: (pedidoElim?.items||[]).map(x=>({nombre:x.nombre, cantidad:x.cantidad})),
        total: pedidoElim?.total || 0
      })
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

  async function onFotoCapturada(pedidoId, e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result
      setFotoComprobante(p => ({...p, [pedidoId]: base64}))
      setSubiendoFoto(p => ({...p, [pedidoId]: true}))
      try {
        // Subir a Firebase Storage
        const res = await fetch(base64)
        const blob = await res.blob()
        const nombre = `comprobantes/mesa_${pedidoId}_${Date.now()}.jpg`
        const storageRef = ref(storage, nombre)
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
        const url = await getDownloadURL(storageRef)
        setFotoComprobante(p => ({...p, [pedidoId]: url}))

        showToast('ok', 'Foto guardada')
      } catch(err) {
        showToast('warn', 'Error al procesar comprobante')
      }
      setSubiendoFoto(p => ({...p, [pedidoId]: false}))
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
        creadoEn: p.creadoEn || serverTimestamp(),
        ...(p.urlComprobante ? { urlComprobante: p.urlComprobante } : {})
      })
      // Registrar domicilio entregado
      registrarEvento('venta_completada', {
        origen: 'admin_domicilio',
        cliente: p.cliente || '',
        telefono: p.telefono || '',
        items: (p.items||[]).map(x=>({nombre:x.nombre, cantidad:x.cantidad, precio:x.precio})),
        total: p.total || 0,
        formaPago: 'Transferencia'
      })
      // Eliminar de domicilio
      await deleteDoc(doc(db,'domicilio', p.id))
      showToast('ok','Pedido marcado como entregado')
    } catch(e) { showToast('err','Error al marcar entregado') }
  }

  async function eliminarDomicilio(id) {
    try {
      const pedidoElim = pedidosDomicilioHoy.find(x => x.id === id)
      if (pedidoElim) registrarEvento('pedido_cancelado', {
        origen: 'admin_domicilio',
        cliente: pedidoElim.cliente || '',
        telefono: pedidoElim.telefono || '',
        items: (pedidoElim.items||[]).map(x=>({nombre:x.nombre, cantidad:x.cantidad})),
        total: pedidoElim.total || 0
      })
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

  // ---- STATS ----
  const [statsRegistros, setStatsRegistros] = useState([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [statsPeriodo, setStatsPeriodo] = useState('hoy')

  async function cargarStats(periodo) {
    setLoadingStats(true)
    try {
      const hoy = new Date()
      const pad = n => String(n).padStart(2,'0')
      const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
      let fechaDesde, fechaHasta
      if (periodo === 'hoy') {
        fechaDesde = fechaHasta = fmt(hoy)
      } else if (periodo === 'semana') {
        const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() + 1)
        fechaDesde = fmt(lunes); fechaHasta = fmt(hoy)
      } else if (periodo === 'mes') {
        fechaDesde = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-01`
        fechaHasta = fmt(hoy)
      }
      const q = query(
        collection(db,'registros'),
        where('fecha','>=',fechaDesde),
        where('fecha','<=',fechaHasta)
      )
      const snap = await getDocs(q)
      setStatsRegistros(snap.docs.map(d => ({id:d.id,...d.data()})))
    } catch(e) { setStatsRegistros([]) }
    setLoadingStats(false)
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
    { key:'stats', label:'Stats' },
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
      <main style={{maxWidth:900,margin:'0 auto',padding:'16px 12px calc(90px + env(safe-area-inset-bottom))'}}>

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
                        background:pagoSel[p.id]==='Efectivo'?'#1a1a1a':'#fff',
                        color:pagoSel[p.id]==='Efectivo'?'#fff':'#666',
                        border:`1.5px solid ${pagoSel[p.id]==='Efectivo'?'#7C9263':'#d0d0d0'}`
                      }}>Efectivo</button>
                      <button onClick={()=>setPagoSel(prev=>({...prev,[p.id]:'Transferencia'}))} style={{
                        flex:1,padding:'9px 6px',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',cursor:'pointer',transition:'0.2s',
                        background:pagoSel[p.id]==='Transferencia'?'#1a1a1a':'#fff',
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
                      {p.urlComprobante && (
                        <div>
                          <button onClick={()=>setModalComprobante(p.urlComprobante)} style={{
                            width:'100%',marginTop:10,padding:'8px 14px',
                            background:'#1a1a1a',border:'none',
                            borderRadius:8,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,
                            color:'#fff',cursor:'pointer'
                          }}>
                            Ver transferencia
                          </button>

                        </div>
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

        {/* ===== STATS ===== */}
        {tab==='stats' && (() => {
          // Calcular métricas desde registros
          const ventas = statsRegistros.filter(r => r.tipo === 'venta_completada')
          const cancelados = statsRegistros.filter(r => r.tipo === 'pedido_cancelado')
          const sesiones = statsRegistros.filter(r => r.tipo === 'sesion_inicio')
          const productosAgregados = statsRegistros.filter(r => r.tipo === 'producto_agregado')

          // Total vendido
          const totalVendido = ventas.reduce((s,r) => s + parseFloat(r.total||0), 0)

          // Productos más vendidos
          const conteoProductos = {}
          ventas.forEach(r => {
            (r.items||[]).forEach(it => {
              conteoProductos[it.nombre] = (conteoProductos[it.nombre]||0) + (it.cantidad||1)
            })
          })
          const productosRanking = Object.entries(conteoProductos)
            .sort((a,b) => b[1]-a[1]).slice(0,8)
          const maxVentas = productosRanking[0]?.[1] || 1

          // Ventas por hora (hoy)
          const ventasPorHora = {}
          ventas.forEach(r => {
            const ts = r.timestamp?.toDate?.()
            if (!ts) return
            const hora = ts.getHours()
            ventasPorHora[hora] = (ventasPorHora[hora]||0) + 1
          })
          const horasData = Array.from({length:24},(_,i)=>({h:i,v:ventasPorHora[i]||0}))
            .filter(x => x.v > 0 || (x.h >= 8 && x.h <= 22))
          const maxHora = Math.max(...horasData.map(x=>x.v), 1)

          // Forma de pago
          const pagoConteo = {}
          ventas.forEach(r => {
            const p = r.formaPago || 'Sin datos'
            pagoConteo[p] = (pagoConteo[p]||0) + 1
          })

          // Origen ventas
          const origenConteo = {}
          ventas.forEach(r => {
            const o = r.origen === 'admin_mesa' ? 'Mesa' : r.origen === 'admin_domicilio' ? 'Domicilio' : 'Otro'
            origenConteo[o] = (origenConteo[o]||0) + 1
          })

          return (
            <div style={{animation:'fadeIn 0.3s ease',paddingBottom:20}}>

              {/* Header */}
              <div style={{marginBottom:20,paddingBottom:14,borderBottom:'1px solid #f0f0f0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:700,color:'#1a1a1a'}}>Estadísticas</h2>
                  <p style={{fontSize:11,color:'#aaa',marginTop:2,fontFamily:'Poppins,sans-serif'}}>Análisis de ventas y actividad</p>
                </div>
              </div>

              {/* Selector de período */}
              <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
                {[{k:'hoy',l:'Hoy'},{k:'semana',l:'Esta semana'},{k:'mes',l:'Este mes'}].map(p => (
                  <button key={p.k} onClick={()=>{setStatsPeriodo(p.k);cargarStats(p.k)}} style={{
                    padding:'7px 16px',borderRadius:100,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',transition:'0.15s',
                    background:statsPeriodo===p.k?'#1a1a1a':'#fff',
                    color:statsPeriodo===p.k?'#fff':'#666',
                    border:`1.5px solid ${statsPeriodo===p.k?'#1a1a1a':'#e0e0e0'}`
                  }}>{p.l}</button>
                ))}
                {statsRegistros.length === 0 && !loadingStats && (
                  <button onClick={()=>cargarStats(statsPeriodo)} style={{padding:'7px 16px',borderRadius:100,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',background:'#f4f4f4',color:'#666',border:'1.5px solid #e0e0e0'}}>
                    Cargar datos
                  </button>
                )}
              </div>

              {loadingStats ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,gap:12}}>
                  <div style={{width:24,height:24,border:'2px solid #e0e0e0',borderTopColor:'#1a1a1a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  <span style={{color:'#bbb',fontSize:13,fontFamily:'Poppins,sans-serif'}}>Cargando...</span>
                </div>
              ) : (
                <>
                  {/* KPIs principales */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                    {[
                      {label:'Total vendido', value:`$${totalVendido.toFixed(2)}`, sub:`${ventas.length} ventas completadas`, highlight:true},
                      {label:'Pedidos cancelados', value:cancelados.length, sub:`${ventas.length + cancelados.length} pedidos totales`},
                      {label:'Sesiones de clientes', value:sesiones.length, sub:'Visitas a la app'},
                      {label:'Tasa de cancelación', value: ventas.length + cancelados.length > 0 ? `${Math.round(cancelados.length/(ventas.length+cancelados.length)*100)}%` : '0%', sub:'Del total de pedidos'},
                    ].map((kpi,i) => (
                      <div key={i} style={{
                        background: kpi.highlight ? '#1a1a1a' : '#fff',
                        border:`1px solid ${kpi.highlight ? '#1a1a1a' : '#ebebeb'}`,
                        borderRadius:14,padding:'16px 14px'
                      }}>
                        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:kpi.highlight?'#888':'#bbb',fontFamily:'Poppins,sans-serif',marginBottom:8}}>{kpi.label}</div>
                        <div style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:700,color:kpi.highlight?'#fff':'#1a1a1a',marginBottom:4}}>{kpi.value}</div>
                        <div style={{fontSize:11,color:kpi.highlight?'#666':'#bbb',fontFamily:'Poppins,sans-serif'}}>{kpi.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Productos más vendidos */}
                  {productosRanking.length > 0 && (
                    <div style={{background:'#fff',border:'1px solid #ebebeb',borderRadius:14,padding:'18px 16px',marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#bbb',marginBottom:16,fontFamily:'Poppins,sans-serif'}}>Productos más vendidos</div>
                      <div style={{display:'flex',flexDirection:'column',gap:10}}>
                        {productosRanking.map(([nombre, cant], i) => (
                          <div key={nombre}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{
                                  fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,
                                  color: i===0?'#1a1a1a':'#aaa',minWidth:16,textAlign:'center'
                                }}>{i+1}</span>
                                <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{nombre}</span>
                              </div>
                              <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a'}}>{cant} <span style={{fontSize:11,color:'#bbb',fontWeight:400}}>uds</span></span>
                            </div>
                            <div style={{height:6,background:'#f5f5f5',borderRadius:3,overflow:'hidden'}}>
                              <div style={{
                                height:'100%',borderRadius:3,transition:'width 0.6s ease',
                                width:`${Math.round(cant/maxVentas*100)}%`,
                                background: i===0 ? '#1a1a1a' : i===1 ? '#555' : '#c0c0c0'
                              }}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ventas por hora */}
                  {horasData.some(x=>x.v>0) && (
                    <div style={{background:'#fff',border:'1px solid #ebebeb',borderRadius:14,padding:'18px 16px',marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#bbb',marginBottom:16,fontFamily:'Poppins,sans-serif'}}>Actividad por hora</div>
                      <div style={{display:'flex',alignItems:'flex-end',gap:4,height:80}}>
                        {horasData.map(({h,v}) => (
                          <div key={h} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                            <div style={{
                              width:'100%',borderRadius:'3px 3px 0 0',transition:'height 0.4s ease',
                              height: v > 0 ? `${Math.max(8,Math.round(v/maxHora*64))}px` : '3px',
                              background: v > 0 ? '#1a1a1a' : '#f0f0f0',
                              minHeight:3
                            }}/>
                            <span style={{fontSize:8,color:'#bbb',fontFamily:'Poppins,sans-serif'}}>{h}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Forma de pago + Origen */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                    {/* Forma de pago */}
                    <div style={{background:'#fff',border:'1px solid #ebebeb',borderRadius:14,padding:'16px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#bbb',marginBottom:14,fontFamily:'Poppins,sans-serif'}}>Forma de pago</div>
                      {Object.keys(pagoConteo).length === 0 ? (
                        <div style={{fontSize:12,color:'#ddd',textAlign:'center',padding:'10px 0',fontFamily:'Poppins,sans-serif'}}>Sin datos</div>
                      ) : Object.entries(pagoConteo).map(([p,c]) => (
                        <div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                          <span style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>{p}</span>
                          <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a'}}>{c}</span>
                        </div>
                      ))}
                    </div>
                    {/* Origen */}
                    <div style={{background:'#fff',border:'1px solid #ebebeb',borderRadius:14,padding:'16px 14px'}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#bbb',marginBottom:14,fontFamily:'Poppins,sans-serif'}}>Origen</div>
                      {Object.keys(origenConteo).length === 0 ? (
                        <div style={{fontSize:12,color:'#ddd',textAlign:'center',padding:'10px 0',fontFamily:'Poppins,sans-serif'}}>Sin datos</div>
                      ) : Object.entries(origenConteo).map(([o,c]) => (
                        <div key={o} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                          <span style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>{o}</span>
                          <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a'}}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Productos explorados (clicks en agregar) */}
                  {productosAgregados.length > 0 && (() => {
                    const explorados = {}
                    productosAgregados.forEach(r => {
                      explorados[r.nombre] = (explorados[r.nombre]||0) + 1
                    })
                    const ranking = Object.entries(explorados).sort((a,b)=>b[1]-a[1]).slice(0,5)
                    return (
                      <div style={{background:'#fff',border:'1px solid #ebebeb',borderRadius:14,padding:'18px 16px',marginBottom:16}}>
                        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#bbb',marginBottom:4,fontFamily:'Poppins,sans-serif'}}>Interés del cliente</div>
                        <div style={{fontSize:11,color:'#ccc',fontFamily:'Poppins,sans-serif',marginBottom:14}}>Productos que más agregan al carrito</div>
                        {ranking.map(([n,c],i) => (
                          <div key={n} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f8f8f8'}}>
                            <span style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>{n}</span>
                            <span style={{fontSize:12,fontWeight:700,color:'#1a1a1a',fontFamily:'Poppins,sans-serif'}}>{c}x</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {statsRegistros.length === 0 && (
                    <div style={{textAlign:'center',padding:'40px 20px',color:'#ccc'}}>
                      <div style={{fontSize:13,fontFamily:'Poppins,sans-serif',marginBottom:8}}>Sin datos en este período</div>
                      <div style={{fontSize:11,fontFamily:'Poppins,sans-serif',color:'#ddd'}}>Los registros se generan automáticamente con el uso de la app</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

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
                              {p.urlComprobante ? (
                                <button onClick={()=>setModalComprobante(p.urlComprobante)} style={{
                                  background:'#1a1a1a',border:'none',color:'#fff',
                                  padding:'4px 10px',borderRadius:6,fontFamily:'Poppins,sans-serif',
                                  fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'
                                }}>
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

      {/* ===== NAV INFERIOR PÍLDORA ADMIN ===== */}
      <div style={{position:'fixed',bottom:'calc(12px + env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',width:'calc(100% - 32px)',maxWidth:440,zIndex:1000}}>
        <nav style={{background:'#1a1a1a',borderRadius:100,padding:'6px 4px',display:'flex',alignItems:'center',boxShadow:'0 8px 28px rgba(0,0,0,0.4)'}}>
          {navItems.map(n => {
            const activo = tab === n.key
            const ICONOS = {
              menu: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><line x1='3' y1='6' x2='21' y2='6'/><line x1='3' y1='12' x2='21' y2='12'/><line x1='3' y1='18' x2='21' y2='18'/></svg>,
              pedido: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='16' y1='13' x2='8' y2='13'/><line x1='16' y1='17' x2='8' y2='17'/><polyline points='10 9 9 9 8 9'/></svg>,
              proceso: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/></svg>,
              domicilio: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z'/><polyline points='9 22 9 12 15 12 15 22'/></svg>,
              historial: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><polyline points='12 8 12 12 14 14'/><path d='M3.05 11a9 9 0 1 0 .5-4.5'/><polyline points='1 4 3 6 5 4'/></svg>,
              stats: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/></svg>,
            }
            return (
              <button key={n.key} onClick={()=>{setTab(n.key);if(n.key==='stats')cargarStats(statsPeriodo)}} style={{
                flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                border:'none',background:'none',cursor:'pointer',position:'relative',padding:'2px 0'
              }}>
                {n.badge > 0 && (
                  <span style={{
                    position:'absolute',top:-8,right:'calc(50% - 20px)',
                    background:'#c62828',color:'#fff',borderRadius:100,
                    minWidth:17,height:17,fontSize:9,fontWeight:700,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    padding:'0 4px',zIndex:2,border:'2px solid #1a1a1a'
                  }}>{n.badge}</span>
                )}
                <div style={{
                  width:42,height:42,borderRadius:'50%',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  background: activo ? '#7C9263' : 'transparent',
                  color: activo ? '#fff' : 'rgba(255,255,255,0.45)',
                  transition:'background 0.2s, color 0.2s'
                }}>
                  {ICONOS[n.key]}
                </div>
              </button>
            )
          })}
        </nav>
      </div>

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
            <button onClick={async ()=>{
              await signOut(auth)
              localStorage.removeItem('esencial_modo')
              window.location.reload()
            }} style={{
              background:'#f4f4f4',border:'1px solid #e0e0e0',color:'#1a1a1a',
              borderRadius:7,padding:'8px 20px',fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',width:'100%'
            }}>← Regresar a Inicio</button>
            {onVerComoCliente && (
              <button onClick={onVerComoCliente} style={{
                background:'#7C9263',border:'none',color:'#fff',
                borderRadius:7,padding:'8px 20px',fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer',width:'100%',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6
              }}>
                <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>
                Ver como Cliente
              </button>
            )}
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
              <button onClick={()=>aprobarEmpleado(emp.id)} style={{flex:1,padding:'9px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:7,fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
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

      {/* Modal Ver Comprobante */}
      {modalComprobante && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget)setModalComprobante(null)}}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:400,overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
            <div style={{background:'#1a1a1a',padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:14,color:'#fff'}}>Transferencia</span>
              <button onClick={()=>setModalComprobante(null)} style={{background:'none',border:'none',color:'#999',fontSize:22,cursor:'pointer',lineHeight:1}}>x</button>
            </div>
            <div style={{padding:12,background:'#f8f8f8'}}>
              <img src={modalComprobante} alt='Comprobante' style={{width:'100%',borderRadius:8,display:'block'}}/>
            </div>

            <div style={{padding:'12px 16px'}}>
              <button onClick={()=>setModalComprobante(null)} style={{width:'100%',padding:'11px',background:'#1a1a1a',color:'#fff',border:'none',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>
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
// ==========================================
// ANALYTICS — registrar eventos en Firestore
// ==========================================
async function registrarEvento(tipo, datos = {}) {
  try {
    await addDoc(collection(db, 'registros'), {
      tipo,
      ...datos,
      fecha: new Date().toISOString().slice(0,10), // YYYY-MM-DD
      timestamp: serverTimestamp()
    })
  } catch(e) { /* silencioso — no interrumpir flujo */ }
}

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
  const [modo, setModo] = useState('registro')
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [direccion, setDireccion] = useState('')
  const [referencia, setReferencia] = useState('')
  const [telefono, setTelefono] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  async function registrar() {
    if (!nombre) { setMsg('El nombre es obligatorio'); return }
    if (!direccion) { setMsg('La direccion es obligatoria'); return }
    if (!telefono) { setMsg('El telefono es obligatorio'); return }
    setLoading(true); setMsg(null)
    const perfil = { nombre, cedula, direccion, referencia, telefono, creadoEn: new Date().toISOString() }
    try {
      // Asegurar autenticacion anonima antes de escribir en Firestore
      if (!auth.currentUser || auth.currentUser.isAnonymous) await signInAnonymously(auth)
      const docRef = await addDoc(collection(db,'clientes'), perfil)
      const perfilConId = {...perfil, _id: docRef.id}
      localStorage.setItem('esencial_cliente', JSON.stringify(perfilConId))
      onRegistrado(perfilConId)
    } catch(e) {
      // Solo guardar local si es problema de red real
      if (e.code === 'unavailable' || (e.message && e.message.includes('network'))) {
        localStorage.setItem('esencial_cliente', JSON.stringify(perfil))
        onRegistrado(perfil)
      } else {
        setMsg('Error al guardar perfil, intenta de nuevo')
      }
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
function ClienteApp({ onVolver, esPreview }) {
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
  const [comprobanteCliente, setComprobanteCliente] = useState(null) // base64 preview
  const [urlComprobante, setUrlComprobante] = useState(null) // URL Firebase Storage
  const [subiendoComprobante, setSubiendoComprobante] = useState(false)
  const comprobanteRef = useRef(null)
  const [modalCancelar, setModalCancelar] = useState(false)
  const [pedidoEnviado, setPedidoEnviado] = useState(false)
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
  const [modalPerfilCliente, setModalPerfilCliente] = useState(false)
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editTelefono, setEditTelefono] = useState('')
  const [editDireccion, setEditDireccion] = useState('')
  const [editCedula, setEditCedula] = useState('')
  const [editReferencia, setEditReferencia] = useState('')
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
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

  // Autenticacion anonima para que el cliente pueda escribir en Firestore
  useEffect(() => {
    const iniciar = async () => {
      // En modo preview (admin viendo cliente) NO tocar la sesión de Firebase
      if (!esPreview && (!auth.currentUser || auth.currentUser.isAnonymous)) {
        await signInAnonymously(auth).catch(() => {})
      }
      // Registrar sesión de entrada
      registrarEvento('sesion_inicio', {
        origen: 'cliente_app',
        clienteRegistrado: !!localStorage.getItem('esencial_cliente')
      })
    }
    iniciar()
  }, [])

  // Pre-llenar formulario de envío desde datos del cliente registrado
  useEffect(() => {
    if (cliente) {
      setTmpNombre(cliente.nombre || '')
      setTmpTel(cliente.telefono || '')
      setTmpDir(cliente.direccion || '')
    }
  }, [])

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
  const [busquedaMenu, setBusquedaMenu] = useState('')
  const [vistaGrid, setVistaGrid] = useState('slide') // 'slide' | 'grid'
  // desdeAdmin ahora es la prop esPreview
  const [indiceSlide, setIndiceSlide] = useState(0)
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  const [indicePromo, setIndicePromo] = useState(0)
  const touchPromoX = useRef(null)
  const [favoritos, setFavoritos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('esencial_favoritos') || '[]') } catch { return [] }
  })
  const [modalFavoritos, setModalFavoritos] = useState(false)

  // ── FAVORITOS ────────────────────────────────────────────────────────────
  function toggleFavorito(prod) {
    setFavoritos(prev => {
      const existe = prev.find(f => f.id === prod.id)
      const nuevo = existe
        ? prev.filter(f => f.id !== prod.id)
        : [...prev, { id: prod.id, nombre: prod.nombre, precio: prod.precio, imagen: prod.imagen || null, categoria: prod.categoria }]
      try { localStorage.setItem('esencial_favoritos', JSON.stringify(nuevo)) } catch {}
      return nuevo
    })
  }

  // ── HISTORY API — gestos de retroceso ─────────────────────────────────────
  useEffect(() => {
    window.history.pushState({ nivel: 'menu' }, '')
  }, [])

  useEffect(() => {
    const handleBack = () => {
      if (modalImportante)       { setModalImportante(false);   window.history.pushState({ nivel: 'pedido' }, ''); return }
      if (modalCancelar)         { setModalCancelar(false);     window.history.pushState({ nivel: 'pedido' }, ''); return }
      if (modalPerfilCliente)    { setModalPerfilCliente(false);window.history.pushState({ nivel: 'menu' }, '');  return }
      if (modalFavoritos)        { setModalFavoritos(false);    window.history.pushState({ nivel: 'menu' }, '');  return }
      if (buscadorAbierto)       { setBuscadorAbierto(false);   window.history.pushState({ nivel: 'menu' }, '');  return }
      if (modalPromos)           { setModalPromos(false);       window.history.pushState({ nivel: 'menu' }, '');  return }
      if (vistaCliente === 'pedido') {
        setVistaCliente('menu')
        window.history.pushState({ nivel: 'menu' }, '')
        return
      }
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [modalImportante, modalCancelar, modalPerfilCliente, modalFavoritos, buscadorAbierto, modalPromos, vistaCliente])

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

  const menuFiltradoBase = macroActiva === 'Todos' ? ordenarMenu(menuBaseFiltrado) : menuBaseFiltrado
  const menuFiltrado = busquedaMenu.trim()
    ? menuFiltradoBase.filter(x => x.nombre?.toLowerCase().includes(busquedaMenu.toLowerCase()) || x.descripcion?.toLowerCase().includes(busquedaMenu.toLowerCase()))
    : menuFiltradoBase
  const items = [...(busquedaMenu ? [] : promociones.map(p=>({...p,_esPromo:true}))), ...menuFiltrado]

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
    // Registrar primera vez que agrega producto
    if (delta > 0 && !cantidades[id]) {
      const prod = items.find(x => x.id === id)
      if (prod) registrarEvento('producto_agregado', {
        origen: 'cliente_app',
        productoId: id,
        nombre: prod.nombre,
        categoria: prod.categoria || '',
        precio: prod.precio
      })
    }
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


  async function subirComprobante(base64) {
    setSubiendoComprobante(true)
    try {
      // 1. Subir a Firebase Storage
      const res = await fetch(base64)
      const blob = await res.blob()
      const nombre = `comprobantes/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
      const storageRef = ref(storage, nombre)
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(storageRef)
      setUrlComprobante(url)

      showToast('ok', 'Comprobante adjunto')
    } catch(e) {
      showToast('warn', 'No se pudo subir el comprobante, intenta de nuevo')
      setComprobanteCliente(null)
    }
    setSubiendoComprobante(false)
  }

  async function cargarHistorial() {
    if (!cliente) return
    setLoadingHistorial(true)
    try {
      // Buscar en domicilio (activos) y pedidos (entregados)
      const [snapDom, snapPed] = await Promise.all([
        getDocs(query(collection(db,'domicilio'), where('telefono','==', cliente.telefono))),
        getDocs(query(collection(db,'pedidos'), where('telefono','==', cliente.telefono), where('tipoCliente','==','Domicilio')))
      ])
      const activos = snapDom.docs.map(d => ({id:d.id, ...d.data(), _coleccion:'domicilio'}))
      const entregados = snapPed.docs.map(d => ({id:d.id, ...d.data(), _coleccion:'pedidos'}))
      const todos = [...activos, ...entregados]
      todos.sort((a,b) => (b.creadoEn?.seconds||0) - (a.creadoEn?.seconds||0))
      setHistorialPedidos(todos)
    } catch(e) {
      try {
        const snap = await getDocs(query(collection(db,'domicilio'), where('telefono','==', cliente.telefono)))
        setHistorialPedidos(snap.docs.map(d => ({id:d.id, ...d.data()})))
      } catch(e2) { setHistorialPedidos([]) }
    }
    setLoadingHistorial(false)
  }

  function agregarDelHistorial(pedido) {
    if (!pedido.items?.length) return
    const nuevasCantidades = {...cantidades}
    pedido.items.forEach(it => {
      // Buscar el producto en el menú actual para tener precio actualizado
      const prod = menu.find(m => m.nombre === it.nombre)
      if (!prod) return
      nuevasCantidades[prod.id] = (nuevasCantidades[prod.id] || 0) + it.cantidad
    })
    setCantidades(nuevasCantidades)
    setModalHistorial(false)
    setModalPerfilCliente(false)
    setVistaCliente('pedido')
    showToast('ok', `${pedido.items.length} productos agregados al carrito`)
  }

  async function confirmarEnvio() {
    const n = tmpNombre || cliente?.nombre || ''
    const tel = tmpTel || cliente?.telefono || ''
    if (!n) { showToast('warn','Ingresa tu nombre'); return }
    if (!tel) { showToast('warn','Ingresa tu teléfono'); return }
    if (carrito.length===0) { showToast('warn','Agrega productos al carrito'); return }
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
      if (urlComprobante) domData.urlComprobante = urlComprobante
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
      'Enviado desde la app Esencial FC',

    ].filter(Boolean).join('%0A')

    try{Sound.play('success')}catch(e){}
    // Registrar pedido enviado
    registrarEvento('pedido_enviado_whatsapp', {
      origen: 'cliente_app',
      cliente: n,
      telefono: tel,
      items: itemsData.map(x=>({nombre:x.nombre, cantidad:x.cantidad})),
      subtotal,
      total
    })
    window.open(`https://wa.me/${WA_NUM}?text=${msg}`, '_blank')
    setModalImportante(false)
    setModalPedido(false)
    setCantidades({})
    setComprobanteCliente(null)
    setUrlComprobante(null)
    setVistaCliente('menu')
    setPedidoEnviado(true)
  }

  if (loadingMenu) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:12}}>
      <div style={{width:28,height:28,border:'2px solid #e0e0e0',borderTopColor:'#1a1a1a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <p style={{color:'#bbb',fontSize:12,fontFamily:'Poppins,sans-serif',letterSpacing:1}}>Cargando...</p>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background: vistaGrid==='slide' && vistaCliente==='menu' ? '#000' : '#fff',display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto',position:'relative'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* HEADER SUPERIOR */}
      <div style={{position:'sticky',top:0,zIndex:100,background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'0 16px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <img src='/logo.png' alt='logo' style={{height:28,width:28,objectFit:'contain',borderRadius:4}}/>
          <span style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,color:'#1a1a1a',letterSpacing:0.5}}>Esencial FC</span>
        </div>
        <button onClick={()=>setModalPerfilCliente(true)} style={{display:'flex',alignItems:'center',gap:8,background:'#f7f7f7',border:'1px solid #ebebeb',borderRadius:100,padding:'5px 12px 5px 6px',cursor:'pointer'}}>
          <div style={{width:26,height:26,borderRadius:'50%',background:'#1a1a1a',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,overflow:'hidden'}}>
            {fotoPerfilCliente
              ? <img src={fotoPerfilCliente} alt='p' style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              : <span style={{color:'#fff',fontSize:11,fontWeight:700}}>{cliente ? cliente.nombre?.charAt(0)?.toUpperCase() : 'U'}</span>
            }
          </div>
          <span style={{fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,color:'#1a1a1a',maxWidth:72,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {cliente ? cliente.nombre?.split(' ')[0] : 'Entrar'}
          </span>
        </button>
      </div>

      {/* GRID / CARRUSEL DE PRODUCTOS */}
      <div style={{flex:1, overflow: vistaGrid==='slide' ? 'hidden' : 'auto', paddingBottom: vistaGrid==='grid' ? 'calc(160px + env(safe-area-inset-bottom))' : 0, display: vistaGrid==='slide' ? 'flex' : 'block', flexDirection:'column'}}>

        {/* ── MODO GRID — 2 columnas ── */}
        {vistaGrid === 'grid' && (
          <div style={{padding:'14px 12px 0'}}>
            {(() => {
              const promosGrid = busquedaMenu ? [] : promociones.map(p=>({...p,_esPromo:true}))
              const todosGrid  = [...promosGrid, ...menuFiltrado]
              if (!todosGrid.length) return (
                <div style={{textAlign:'center',padding:'60px 20px',color:'#ccc',fontSize:13,fontFamily:'Poppins,sans-serif'}}>
                  Sin productos{busquedaMenu ? ` para "${busquedaMenu}"` : ''}
                </div>
              )
              return (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {todosGrid.map(prod => {
                    const esPromo = !!prod._esPromo
                    const imgSrc  = imgError[prod.id]
                      ? (IMGS_CATEGORIA[prod.categoria]||IMGS_CATEGORIA['default'])
                      : getImgProducto(prod)
                    const cant = cantidades[prod.id] || 0
                    return (
                      <div key={prod.id} style={{
                        background:'#fff',
                        border: esPromo ? '1.5px solid #7C9263' : '1px solid #ebebeb',
                        borderRadius:14,overflow:'hidden',display:'flex',flexDirection:'column',
                        boxShadow:'0 1px 4px rgba(0,0,0,0.04)'
                      }}>
                        <div style={{aspectRatio:'4/3',background:'#f5f5f5',overflow:'hidden',position:'relative'}}>
                          <img src={imgSrc} alt={prod.nombre}
                            onError={()=>setImgError(p=>({...p,[prod.id]:true}))}
                            style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                          <div style={{
                            position:'absolute',top:8,left:8,
                            background: esPromo ? '#7C9263' : 'rgba(255,255,255,0.92)',
                            borderRadius:6,padding:'2px 7px',fontSize:9,fontWeight:700,
                            color: esPromo ? '#fff' : '#555',
                            letterSpacing:0.8,textTransform:'uppercase',fontFamily:'Poppins,sans-serif'
                          }}>{esPromo ? 'Promo' : prod.categoria}</div>
                        </div>
                        <div style={{padding:'10px 10px 12px',flex:1,display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
                          <div>
                            <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a',marginBottom:2,lineHeight:1.3}}>{prod.nombre}</div>
                            {prod.descripcion && <div style={{fontSize:11,color:'#aaa',lineHeight:1.4,marginBottom:6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{prod.descripcion}</div>}
                          </div>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8}}>
                            <span style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,color:'#1a1a1a'}}>${parseFloat(prod.precio).toFixed(2)}</span>
                            {cant === 0 ? (
                              <button onClick={()=>addCant(prod.id,1)} style={{width:30,height:30,borderRadius:'50%',border:'none',background:'#1a1a1a',color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <button onClick={()=>addCant(prod.id,-1)} style={{width:26,height:26,borderRadius:'50%',border:'1.5px solid #d0d0d0',background:'#fff',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#555'}}>-</button>
                                <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,minWidth:16,textAlign:'center'}}>{cant}</span>
                                <button onClick={()=>addCant(prod.id,1)} style={{width:26,height:26,borderRadius:'50%',border:'none',background:'#1a1a1a',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>+</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── MODO GALERÍA — imagen cuadrada + panel negro info ── */}
        {vistaGrid === 'slide' && (() => {
          const promosSlide = busquedaMenu ? [] : promociones.map(p=>({...p,_esPromo:true}))
          const todosItems  = [...promosSlide, ...menuFiltrado]
          if (!todosItems.length) return (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'#ccc',fontSize:13,fontFamily:'Poppins,sans-serif',background:'#000'}}>Sin productos</div>
          )
          const idxS = Math.min(indiceSlide, todosItems.length-1)
          const prod = todosItems[idxS]
          const imgSrc = imgError[prod.id]
            ? (IMGS_CATEGORIA[prod.categoria]||IMGS_CATEGORIA['default'])
            : getImgProducto(prod)
          const cant = cantidades[prod.id] || 0
          const esPromo = !!prod._esPromo

          return (
            <div
              style={{display:'flex',flexDirection:'column',height:'100%',background:'#000',userSelect:'none'}}
              onTouchStart={e=>{touchStartX.current=e.touches[0].clientX; touchStartY.current=e.touches[0].clientY}}
              onTouchEnd={e=>{
                if(touchStartX.current===null) return
                const dx=e.changedTouches[0].clientX - touchStartX.current
                const dy=Math.abs(e.changedTouches[0].clientY - touchStartY.current)
                if(Math.abs(dx)<35 || dy>90) return
                const next = dx<0 ? Math.min(idxS+1, todosItems.length-1) : Math.max(idxS-1, 0)
                setIndiceSlide(next)
                touchStartX.current=null
              }}>

              {/* ── IMAGEN CUADRADA ── */}
              <div style={{width:'100%',aspectRatio:'1/1',position:'relative',overflow:'hidden',flexShrink:0}}>
                <img key={prod.id} src={imgSrc} alt={prod.nombre}
                  onError={()=>setImgError(p=>({...p,[prod.id]:true}))}
                  style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',display:'block'}}/>

                {/* Degradado inferior — funde imagen con el panel negro */}
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:'45%',background:'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.7) 75%,#000 100%)'}}/>

                {/* Badge promo */}
                {esPromo && (
                  <div style={{position:'absolute',top:12,left:12,background:'#7C9263',color:'#fff',padding:'4px 12px',borderRadius:100,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',fontFamily:'Poppins,sans-serif',zIndex:2}}>Promo</div>
                )}

                {/* Flechas */}
                {idxS > 0 && (
                  <button onClick={()=>setIndiceSlide(i=>Math.max(i-1,0))} style={{position:'absolute',left:10,top:'45%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.35)',backdropFilter:'blur(4px)',border:'none',color:'#fff',width:40,height:40,borderRadius:'50%',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3}}>‹</button>
                )}
                {idxS < todosItems.length-1 && (
                  <button onClick={()=>setIndiceSlide(i=>Math.min(i+1,todosItems.length-1))} style={{position:'absolute',right:10,top:'45%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.35)',backdropFilter:'blur(4px)',border:'none',color:'#fff',width:40,height:40,borderRadius:'50%',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3}}>›</button>
                )}

                {/* Indicadores verticales */}
                <div style={{position:'absolute',top:12,right:12,display:'flex',flexDirection:'column',gap:4,zIndex:2}}>
                  {todosItems.map((_,i)=>(
                    <div key={i} onClick={()=>setIndiceSlide(i)} style={{
                      width:4,height:i===idxS?18:4,borderRadius:2,cursor:'pointer',
                      transition:'0.3s',background:i===idxS?'#fff':'rgba(255,255,255,0.35)'
                    }}/>
                  ))}
                </div>
              </div>

              {/* ── PANEL NEGRO CON INFO ── */}
              <div style={{flex:1,background:'#000',padding:'14px 18px 10px',display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:0}}>
                {/* Categoría + nombre + precio */}
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:2.5,textTransform:'uppercase',color:esPromo?'#7C9263':'rgba(255,255,255,0.35)',fontFamily:'Poppins,sans-serif'}}>
                      {esPromo ? 'Promoción del día' : prod.categoria}
                    </div>
                    {/* Botón favorito — solo en galería */}
                    <button onClick={()=>toggleFavorito(prod)} style={{
                      background:'none',border:'none',cursor:'pointer',padding:4,
                      display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
                    }}>
                      <svg width='20' height='20' viewBox='0 0 24 24' fill={favoritos.find(f=>f.id===prod.id)?'#c62828':'none'} stroke={favoritos.find(f=>f.id===prod.id)?'#c62828':'rgba(255,255,255,0.5)'} strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z'/>
                      </svg>
                    </button>
                  </div>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:6}}>
                    <div style={{fontFamily:'Poppins,sans-serif',fontSize:20,fontWeight:700,color:'#fff',lineHeight:1.2,flex:1}}>{prod.nombre}</div>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:700,color:'#fff',flexShrink:0}}>${parseFloat(prod.precio).toFixed(2)}</span>
                  </div>
                  {prod.descripcion && (
                    <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',lineHeight:1.55,fontFamily:'Poppins,sans-serif',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{prod.descripcion}</div>
                  )}
                </div>

                {/* Controles cantidad */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.08)',borderRadius:14,padding:'10px 16px',border:'1px solid rgba(255,255,255,0.12)',marginTop:10}}>
                  <span style={{fontSize:12,color:'rgba(255,255,255,0.6)',fontFamily:'Poppins,sans-serif',fontWeight:500}}>Cantidad</span>
                  <div style={{display:'flex',alignItems:'center',gap:16}}>
                    <button onClick={()=>addCant(prod.id,-1)} style={{width:34,height:34,borderRadius:'50%',border:'1.5px solid rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.07)',color:'#fff',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:20,fontWeight:700,minWidth:26,textAlign:'center',color:'#fff'}}>{cant}</span>
                    <button onClick={()=>addCant(prod.id,1)} style={{width:34,height:34,borderRadius:'50%',border:'none',background:'#fff',color:'#1a1a1a',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>+</button>
                  </div>
                </div>
              </div>

              {/* ── MINI RESUMEN CARRITO — espacio negro inferior ── */}
              {carrito.length > 0 && (
                <div style={{background:'#000',padding:'10px 18px 14px',flexShrink:0,borderTop:'1px solid rgba(255,255,255,0.07)'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:10,fontWeight:700,letterSpacing:2,textTransform:'uppercase',color:'rgba(255,255,255,0.35)'}}>Tu pedido</span>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,color:'#fff'}}>${total.toFixed(2)}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:90,overflowY:'auto'}}>
                    {carrito.map(item => (
                      <div key={item.id} style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                        <span style={{background:'#7C9263',color:'#fff',borderRadius:'50%',width:18,height:18,fontSize:9,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{item.canti}</span>
                        <span style={{fontFamily:'Poppins,sans-serif',fontSize:12,color:'rgba(255,255,255,0.75)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* BARRA INFERIOR PÍLDORA CLIENTE */}
      {/* Píldora Favoritos — flotante derecha, encima de la nav */}
      {vistaCliente === 'menu' && (
        <div style={{position:'fixed',bottom:'calc(74px + env(safe-area-inset-bottom))',right:'calc((100vw - min(100vw, 480px)) / 2 + 14px)',zIndex:250}}>
          <button onClick={()=>setModalFavoritos(true)} style={{
            background: vistaGrid==='slide' ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.07)',
            backdropFilter:'blur(8px)',
            border: vistaGrid==='slide' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
            borderRadius:100,padding:'7px 14px',
            display:'flex',alignItems:'center',gap:6,cursor:'pointer'
          }}>
            <span style={{fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,letterSpacing:0.3,color:vistaGrid==='slide'?'rgba(255,255,255,0.82)':'#444'}}>Favoritos</span>
            {favoritos.length > 0 && (
              <span style={{background:'#c62828',color:'#fff',borderRadius:'50%',width:16,height:16,fontSize:9,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{favoritos.length}</span>
            )}
          </button>
        </div>
      )}

      {/* Botón carrito flotante — modo lista */}
      {totalItems > 0 && vistaCliente === 'menu' && vistaGrid === 'grid' && (
        <div style={{position:'fixed',bottom:'calc(82px + env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',width:'calc(100% - 64px)',maxWidth:320,zIndex:300}}>
          <button onClick={()=>setVistaCliente('pedido')} style={{
            width:'100%',display:'flex',alignItems:'center',gap:12,justifyContent:'center',
            background:'#1a1a1a',color:'#fff',border:'none',borderRadius:100,
            padding:'13px 22px',boxShadow:'0 6px 20px rgba(0,0,0,0.28)',
            cursor:'pointer',fontFamily:'Poppins,sans-serif'
          }}>
            <span style={{background:'#7C9263',color:'#fff',borderRadius:'50%',width:22,height:22,fontSize:11,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{totalItems}</span>
            <span style={{fontSize:13,fontWeight:700,letterSpacing:0.5}}>Ver pedido</span>
            <span style={{fontSize:14,fontWeight:700}}>${total.toFixed(2)}</span>
          </button>
        </div>
      )}

      <div style={{position:'fixed',bottom:'calc(12px + env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',width:'calc(100% - 32px)',maxWidth:440,zIndex:200}}>
        <nav style={{background:'#fff',borderRadius:100,padding:'6px 4px',display:'flex',alignItems:'center',boxShadow:'0 8px 28px rgba(0,0,0,0.18)'}}>
          {[
            {
              key:'vista',
              activo: vistaCliente === 'menu',
              onClick: ()=>{ setVistaGrid(v=>v==='slide'?'grid':'slide'); setIndiceSlide(0); setVistaCliente('menu') },
              icon: vistaGrid==='slide'
                ? <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><rect x='2' y='3' width='20' height='18' rx='2'/><line x1='8' y1='10' x2='16' y2='10'/><line x1='8' y1='14' x2='16' y2='14'/></svg>
                : <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><rect x='2' y='3' width='9' height='9' rx='1'/><rect x='13' y='3' width='9' height='9' rx='1'/><rect x='2' y='14' width='9' height='9' rx='1'/><rect x='13' y='14' width='9' height='9' rx='1'/></svg>,
              badge: null
            },
            {
              key:'buscar',
              activo: buscadorAbierto,
              onClick: ()=>setBuscadorAbierto(true),
              icon: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>,
              badge: busquedaMenu ? 1 : null
            },
            {
              key:'promos',
              activo: modalPromos,
              onClick: ()=>{ if(promociones.length>0) setModalPromos(true) },
              icon: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z'/><line x1='7' y1='7' x2='7.01' y2='7'/></svg>,
              badge: promociones.length > 0 ? promociones.length : null
            },
            {
              key:'carrito',
              activo: vistaCliente === 'pedido',
              onClick: ()=>setVistaCliente('pedido'),
              icon: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z'/><line x1='3' y1='6' x2='21' y2='6'/><path d='M16 10a4 4 0 01-8 0'/></svg>,
              badge: totalItems > 0 ? totalItems : null
            },
            {
              key:'perfil',
              activo: modalPerfilCliente,
              onClick: ()=>setModalPerfilCliente(true),
              icon: <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>,
              badge: null
            },
          ].map(t => (
            <button key={t.key} onClick={t.onClick} style={{
              flex:1,display:'flex',alignItems:'center',justifyContent:'center',
              border:'none',background:'none',cursor:'pointer',position:'relative',padding:'2px 0'
            }}>
              {t.badge > 0 && (
                <span style={{
                  position:'absolute',top:-8,right:'calc(50% - 20px)',
                  background:'#c62828',color:'#fff',borderRadius:100,
                  minWidth:17,height:17,fontSize:9,fontWeight:700,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  padding:'0 4px',zIndex:2,border:'2px solid #fff'
                }}>{t.badge}</span>
              )}
              <div style={{
                width:42,height:42,borderRadius:'50%',
                display:'flex',alignItems:'center',justifyContent:'center',
                background: t.activo ? '#7C9263' : 'transparent',
                color: t.activo ? '#fff' : '#333',
                transition:'background 0.2s, color 0.2s'
              }}>
                {t.icon}
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* VISTA PEDIDO */}
      {vistaCliente==='pedido' && (
        <div style={{position:'fixed',inset:0,background:'#fff',zIndex:500,display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto',left:'50%',transform:'translateX(-50%)',width:'100%'}}>

          {/* Header */}
          <div style={{padding:'0 16px',height:56,borderBottom:'1px solid #f0f0f0',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,color:'#1a1a1a'}}>Tu pedido</span>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'16px 16px 24px'}}>
            {carrito.length === 0 ? (
              <div style={{textAlign:'center',padding:'60px 20px',color:'#ccc'}}>
                <div style={{fontSize:13,fontFamily:'Poppins,sans-serif',marginBottom:16}}>Tu pedido está vacío</div>
                <button onClick={()=>setVistaCliente('menu')} style={{background:'#1a1a1a',color:'#fff',border:'none',borderRadius:100,padding:'10px 24px',fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>Ver menú</button>
              </div>
            ) : (
              <>
                {/* Items del pedido */}
                <div style={{marginBottom:16}}>
                  {carrito.map(x=>(
                    <div key={x.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #f5f5f5'}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{x.nombre}</div>
                        <div style={{fontSize:12,color:'#aaa',marginTop:2}}>${parseFloat(x.precio).toFixed(2)} c/u</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <button onClick={()=>addCant(x.id,-1)} style={{width:26,height:26,borderRadius:'50%',border:'1.5px solid #e0e0e0',background:'#fff',fontSize:15,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#555'}}>-</button>
                        <span style={{fontFamily:'Poppins,sans-serif',fontSize:14,fontWeight:700,minWidth:20,textAlign:'center'}}>{x.cantidad}</span>
                        <button onClick={()=>addCant(x.id,1)} style={{width:26,height:26,borderRadius:'50%',border:'none',background:'#1a1a1a',fontSize:15,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>+</button>
                        <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a',minWidth:48,textAlign:'right'}}>${(parseFloat(x.precio)*x.cantidad).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totales */}
                <div style={{background:'#f9f9f9',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#888',marginBottom:8,fontFamily:'Poppins,sans-serif'}}>
                    <span>Subtotal ({totalItems} items)</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#888',marginBottom:12,fontFamily:'Poppins,sans-serif',paddingBottom:12,borderBottom:'1px solid #ebebeb'}}>
                    <span>Envío a domicilio</span>
                    <span>${DOMICILIO_COSTO.toFixed(2)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,color:'#1a1a1a',letterSpacing:0.5}}>Total</span>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:700,color:'#1a1a1a'}}>${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Datos de pago */}
                <div style={{border:'1px solid #ebebeb',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#aaa',marginBottom:12,fontFamily:'Poppins,sans-serif'}}>Datos de transferencia</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:4,fontFamily:'Poppins,sans-serif'}}>Banco Pichincha — Cuenta Ahorros</div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:16,fontWeight:700,letterSpacing:1,color:'#1a1a1a'}}>{CUENTA}</span>
                    <button onClick={()=>copiar(CUENTA,'cuenta')} style={{background:copiado==='cuenta'?'#7C9263':'#1a1a1a',color:'#fff',border:'none',borderRadius:7,padding:'6px 14px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Poppins,sans-serif',transition:'0.2s'}}>
                      {copiado==='cuenta' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <div style={{borderTop:'1px solid #f0f0f0',paddingTop:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:12,color:'#888',fontFamily:'Poppins,sans-serif'}}>WhatsApp: 0996368109</span>
                    <button onClick={()=>copiar('0996368109','tel')} style={{background:'#f4f4f4',color:'#1a1a1a',border:'1px solid #e0e0e0',borderRadius:7,padding:'5px 12px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'Poppins,sans-serif'}}>
                      {copiado==='tel' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>

                {/* Adjuntar comprobante */}
                <div style={{border:'1px dashed #d0d0d0',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#aaa',marginBottom:10,fontFamily:'Poppins,sans-serif'}}>Comprobante de pago</div>
                  {!comprobanteCliente ? (
                    <button onClick={()=>comprobanteRef.current?.click()} style={{
                      width:'100%',padding:'11px',background:'#f9f9f9',
                      border:'1px solid #e0e0e0',borderRadius:10,
                      fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,
                      color:'#888',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8
                    }}>
                      <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg>
                      Subir foto del comprobante
                    </button>
                  ) : subiendoComprobante ? (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px'}}>
                      <div style={{width:16,height:16,border:'2px solid #e0e0e0',borderTopColor:'#1a1a1a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                      <span style={{fontSize:12,color:'#888',fontFamily:'Poppins,sans-serif'}}>Subiendo...</span>
                    </div>
                  ) : (
                    <div style={{position:'relative'}}>
                      <img src={comprobanteCliente} alt='comprobante' style={{width:'100%',maxHeight:160,objectFit:'contain',borderRadius:8,display:'block'}}/>
                      <div style={{marginTop:8,display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:'#7C9263',flexShrink:0}}/>
                        <span style={{fontSize:12,color:'#7C9263',fontFamily:'Poppins,sans-serif',fontWeight:600}}>Comprobante adjunto</span>
                        <button onClick={()=>{setComprobanteCliente(null);setUrlComprobante(null)}} style={{marginLeft:'auto',background:'none',border:'none',fontSize:12,color:'#ccc',cursor:'pointer',fontFamily:'Poppins,sans-serif'}}>Quitar</button>
                      </div>
                    </div>
                  )}
                  <input type='file' accept='image/*' style={{display:'none'}} ref={comprobanteRef}
                    onChange={e=>{
                      const file=e.target.files?.[0]; if(!file) return
                      const reader=new FileReader()
                      reader.onload=ev=>{
                        const img=new window.Image()
                        img.onload=()=>{
                          const MAX=1200; const scale=Math.min(MAX/img.width,MAX/img.height,1)
                          const canvas=document.createElement('canvas')
                          canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale)
                          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height)
                          const compressed=canvas.toDataURL('image/jpeg',0.82)
                          setComprobanteCliente(compressed)
                          subirComprobante(compressed)
                        }
                        img.src=ev.target.result
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </div>

                {/* Datos de envío — siempre visible, pre-llenado si hay cliente */}
                {(()=>{
                  const [envNombre, setEnvNombre] = [
                    tmpNombre || (cliente?.nombre||''),
                    v => setTmpNombre(v)
                  ]
                  const [envTel, setEnvTel] = [
                    tmpTel || (cliente?.telefono||''),
                    v => setTmpTel(v)
                  ]
                  const [envDir, setEnvDir] = [
                    tmpDir || (cliente?.direccion||''),
                    v => setTmpDir(v)
                  ]
                  const esRegistrado = !!cliente
                  return (
                    <div style={{border:'1px solid #ebebeb',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#aaa',fontFamily:'Poppins,sans-serif'}}>Datos de envío</div>
                        {esRegistrado && (
                          <span style={{fontSize:10,color:'#7C9263',fontFamily:'Poppins,sans-serif',fontWeight:600}}>✓ Datos guardados</span>
                        )}
                      </div>
                      {[
                        {label:'Nombre *',val:tmpNombre||(cliente?.nombre||''),set:setTmpNombre,ph:'Tu nombre',type:'text'},
                        {label:'Teléfono *',val:tmpTel||(cliente?.telefono||''),set:setTmpTel,ph:'09XXXXXXXX',type:'tel'},
                      ].map(f=>(
                        <div key={f.label} style={{marginBottom:10}}>
                          <label style={{display:'block',fontSize:10,letterSpacing:1,textTransform:'uppercase',color:'#bbb',marginBottom:5,fontFamily:'Poppins,sans-serif',fontWeight:600}}>{f.label}</label>
                          <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} type={f.type}
                            style={{width:'100%',border:'1.5px solid #e8e8e8',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',color:'#1a1a1a',boxSizing:'border-box'}}/>
                        </div>
                      ))}
                      {/* Dirección + GPS */}
                      <div style={{marginBottom:6}}>
                        <label style={{display:'block',fontSize:10,letterSpacing:1,textTransform:'uppercase',color:'#bbb',marginBottom:5,fontFamily:'Poppins,sans-serif',fontWeight:600}}>Dirección / Ubicación</label>
                        <input value={tmpDir||(cliente?.direccion||'')} onChange={e=>setTmpDir(e.target.value)}
                          placeholder='Barrio, calle o dirección'
                          style={{width:'100%',border:'1.5px solid #e8e8e8',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'10px 13px',outline:'none',color:'#1a1a1a',boxSizing:'border-box',marginBottom:6}}/>
                        <button onClick={()=>{
                          setLoadingGPS(true)
                          navigator.geolocation.getCurrentPosition(pos=>{
                            const url = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`
                            setTmpDir(url)
                            setLoadingGPS(false)
                            showToast('ok','Ubicación GPS obtenida')
                          }, err=>{
                            setLoadingGPS(false)
                            showToast('warn','No se pudo obtener la ubicación')
                          }, {timeout:10000})
                        }} disabled={loadingGPS} style={{
                          width:'100%',padding:'9px',background:'#f0f7ed',color:'#7C9263',
                          border:'1.5px solid #c8dfc0',borderRadius:9,fontFamily:'Poppins,sans-serif',
                          fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',
                          justifyContent:'center',gap:6
                        }}>
                          {loadingGPS
                            ? <><div style={{width:12,height:12,border:'2px solid #7C9263',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Obteniendo ubicación...</>
                            : <><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><circle cx='12' cy='12' r='3'/><path d='M12 2v3m0 14v3M2 12h3m14 0h3'/></svg>Usar mi ubicación GPS</>
                          }
                        </button>
                      </div>
                      {esRegistrado && cliente?.referencia && (
                        <div style={{marginTop:8,padding:'8px 10px',background:'#f9f9f9',borderRadius:8,fontSize:11,color:'#888',fontFamily:'Poppins,sans-serif'}}>
                          Referencia: {cliente.referencia}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </div>

          {/* Botones fondo: WhatsApp arriba, Menú+Cancelar abajo */}
          <div style={{padding:'8px 16px 16px',borderTop:'1px solid #f0f0f0',background:'#fff',flexShrink:0}}>
            {carrito.length > 0 && (
              <button onClick={confirmarEnvio} style={{
                width:'100%',padding:'15px',background:'#1a1a1a',color:'#fff',
                border:'none',borderRadius:12,fontFamily:'Poppins,sans-serif',
                fontSize:14,fontWeight:700,letterSpacing:0.5,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:8
              }}>
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'><path d='M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.04 1.22 2 2 0 012 .04h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z'/></svg>
                Enviar pedido por WhatsApp
              </button>
            )}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setVistaCliente('menu')} style={{
                flex:1,padding:'12px',background:'#f4f4f4',color:'#1a1a1a',
                border:'none',borderRadius:11,fontFamily:'Poppins,sans-serif',fontSize:12,
                fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5
              }}>
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><path d='M19 12H5M12 5l-7 7 7 7'/></svg>
                Menú
              </button>
              {carrito.length > 0 && (
                <button onClick={()=>setModalCancelar(true)} style={{
                  flex:1,padding:'12px',background:'#fff',color:'#c62828',
                  border:'1.5px solid #ffcdd2',borderRadius:11,fontFamily:'Poppins,sans-serif',fontSize:12,
                  fontWeight:700,cursor:'pointer'
                }}>Cancelar pedido</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL BUSCADOR */}
      {buscadorAbierto && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',flexDirection:'column'}}
          onClick={e=>{if(e.target===e.currentTarget){setBuscadorAbierto(false)}}}>
          <div style={{background:'#fff',padding:'16px 16px 0'}}>
            <div style={{position:'relative'}}>
              <svg style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='#bbb' strokeWidth='2' strokeLinecap='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>
              <input autoFocus value={busquedaMenu} onChange={e=>setBusquedaMenu(e.target.value)}
                placeholder='Buscar producto...'
                style={{width:'100%',padding:'11px 36px 11px 36px',border:'1.5px solid #ebebeb',borderRadius:12,fontFamily:'Poppins,sans-serif',fontSize:14,color:'#1a1a1a',outline:'none',boxSizing:'border-box',background:'#f9f9f9',marginBottom:12}}/>
              {busquedaMenu && (
                <button onClick={()=>setBusquedaMenu('')} style={{position:'absolute',right:11,top:'50%',transform:'translateY(-57%)',background:'none',border:'none',cursor:'pointer',color:'#bbb',fontSize:20,lineHeight:1}}>×</button>
              )}
            </div>
          </div>
          {/* Resultados */}
          <div style={{flex:1,overflowY:'auto',background:'#fff',padding:'8px 16px 32px'}}>
            {busquedaMenu.trim() ? (() => {
              const resultados = menu.filter(x => x.visibleClientes!==false && (
                x.nombre?.toLowerCase().includes(busquedaMenu.toLowerCase()) ||
                x.descripcion?.toLowerCase().includes(busquedaMenu.toLowerCase())
              ))
              if (!resultados.length) return (
                <div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontFamily:'Poppins,sans-serif',fontSize:13}}>Sin resultados para "{busquedaMenu}"</div>
              )
              return resultados.map(prod => {
                const cant = cantidades[prod.id] || 0
                const imgSrc = imgError[prod.id] ? (IMGS_CATEGORIA[prod.categoria]||IMGS_CATEGORIA['default']) : getImgProducto(prod)
                return (
                  <div key={prod.id} style={{display:'flex',gap:12,padding:'12px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}>
                    <img src={imgSrc} alt={prod.nombre} onError={()=>setImgError(p=>({...p,[prod.id]:true}))}
                      style={{width:56,height:56,objectFit:'cover',borderRadius:10,flexShrink:0,background:'#f5f5f5'}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a',marginBottom:2}}>{prod.nombre}</div>
                      {prod.descripcion && <div style={{fontSize:11,color:'#aaa',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{prod.descripcion}</div>}
                      <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a',marginTop:3}}>${parseFloat(prod.precio).toFixed(2)}</div>
                    </div>
                    <div style={{flexShrink:0}}>
                      {cant===0 ? (
                        <button onClick={()=>addCant(prod.id,1)} style={{width:32,height:32,borderRadius:'50%',border:'none',background:'#1a1a1a',color:'#fff',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <button onClick={()=>addCant(prod.id,-1)} style={{width:28,height:28,borderRadius:'50%',border:'1.5px solid #d0d0d0',background:'#fff',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#555'}}>-</button>
                          <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,minWidth:18,textAlign:'center'}}>{cant}</span>
                          <button onClick={()=>addCant(prod.id,1)} style={{width:28,height:28,borderRadius:'50%',border:'none',background:'#1a1a1a',color:'#fff',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            })() : (
              <div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontFamily:'Poppins,sans-serif',fontSize:13}}>Escribe para buscar...</div>
            )}
          </div>
          {/* Botón cerrar al fondo */}
          <div style={{background:'#fff',padding:'12px 16px',paddingBottom:'calc(12px + env(safe-area-inset-bottom))'}}>
            <button onClick={()=>{setBuscadorAbierto(false);setBusquedaMenu('')}} style={{
              width:'100%',padding:'14px',background:'#1a1a1a',color:'#fff',border:'none',
              borderRadius:12,fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer'
            }}>Cerrar búsqueda</button>
          </div>
        </div>
      )}

      {/* MODAL PROMOCIONES CLIENTE — estilo galería */}
      {modalPromos && promociones.length > 0 && (()=>{
        const idxP = Math.min(indicePromo||0, promociones.length-1)
        const prod  = promociones[idxP]
        const cant  = cantidades[prod?.id] || 0
        const imgSrc = prod ? (imgError[prod.id]?(IMGS_CATEGORIA[prod.categoria]||IMGS_CATEGORIA['default']):getImgProducto(prod)) : null
        return (
          <div style={{position:'fixed',inset:0,zIndex:2500,background:'#000',display:'flex',flexDirection:'column'}}
            onTouchStart={e=>{touchPromoX.current=e.touches[0].clientX}}
            onTouchEnd={e=>{
              if(touchPromoX.current===null) return
              const dx=e.changedTouches[0].clientX-touchPromoX.current
              if(Math.abs(dx)<35) return
              const next=dx<0?Math.min(idxP+1,promociones.length-1):Math.max(idxP-1,0)
              setIndicePromo(next); touchPromoX.current=null
            }}>
            {/* Imagen fullscreen */}
            <div style={{flex:1,position:'relative',overflow:'hidden'}}>
              {imgSrc && <img key={prod.id} src={imgSrc} alt={prod.nombre}
                onError={()=>setImgError(p=>({...p,[prod.id]:true}))}
                style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>}
              <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.2) 50%,transparent 100%)'}}/>
              {/* X discreta arriba — solo para emergencia */}
              <button onClick={()=>setModalPromos(false)} style={{position:'absolute',top:14,right:14,background:'rgba(0,0,0,0.25)',border:'none',color:'rgba(255,255,255,0.6)',width:30,height:30,borderRadius:'50%',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3}}>×</button>
              {/* Badge promo */}
              <div style={{position:'absolute',top:16,left:16,background:'#7C9263',color:'#fff',padding:'4px 12px',borderRadius:100,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',fontFamily:'Poppins,sans-serif',zIndex:3}}>Promo del día</div>
              {/* Flechas */}
              {idxP > 0 && <button onClick={()=>setIndicePromo(i=>i-1)} style={{position:'absolute',left:12,top:'45%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',border:'none',color:'#fff',width:40,height:40,borderRadius:'50%',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3}}>‹</button>}
              {idxP < promociones.length-1 && <button onClick={()=>setIndicePromo(i=>i+1)} style={{position:'absolute',right:12,top:'45%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',border:'none',color:'#fff',width:40,height:40,borderRadius:'50%',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3}}>›</button>}
              {/* Info */}
              <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'0 20px 20px',zIndex:2}}>
                <div style={{fontFamily:'Poppins,sans-serif',fontSize:24,fontWeight:700,color:'#fff',lineHeight:1.15,marginBottom:4}}>{prod.nombre}</div>
                {prod.descripcion && <div style={{fontSize:13,color:'rgba(255,255,255,0.65)',lineHeight:1.5,fontFamily:'Poppins,sans-serif',marginBottom:12}}>{prod.descripcion}</div>}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.13)',backdropFilter:'blur(8px)',borderRadius:14,padding:'10px 16px',border:'1px solid rgba(255,255,255,0.18)'}}>
                  <span style={{fontFamily:'Poppins,sans-serif',fontSize:22,fontWeight:700,color:'#fff'}}>${parseFloat(prod.precio).toFixed(2)}</span>
                  <div style={{display:'flex',alignItems:'center',gap:14}}>
                    <button onClick={()=>addCant(prod.id,-1)} style={{width:34,height:34,borderRadius:'50%',border:'1.5px solid rgba(255,255,255,0.4)',background:'rgba(0,0,0,0.3)',color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>-</button>
                    <span style={{fontFamily:'Poppins,sans-serif',fontSize:20,fontWeight:700,minWidth:26,textAlign:'center',color:'#fff'}}>{cant}</span>
                    <button onClick={()=>addCant(prod.id,1)} style={{width:34,height:34,borderRadius:'50%',border:'none',background:'#fff',color:'#1a1a1a',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>+</button>
                  </div>
                </div>
              </div>
            </div>
            {/* Indicadores */}
            <div style={{background:'#000',padding:'10px 16px 16px',paddingBottom:'calc(16px + env(safe-area-inset-bottom))'}}>
              {promociones.length > 1 && (
                <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:12}}>
                  {promociones.map((_,i)=>(
                    <div key={i} onClick={()=>setIndicePromo(i)} style={{width:i===idxP?20:6,height:6,borderRadius:3,background:i===idxP?'#7C9263':'rgba(255,255,255,0.25)',transition:'0.3s',cursor:'pointer'}}/>
                  ))}
                </div>
              )}
              <button onClick={()=>setModalPromos(false)} style={{
                width:'100%',padding:'14px',background:'#fff',color:'#1a1a1a',border:'none',
                borderRadius:12,fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer'
              }}>Cerrar promociones</button>
            </div>
          </div>
        )
      })()}

      {/* PANTALLA ÉXITO POST-PEDIDO */}
      {pedidoEnviado && (
        <div style={{position:'fixed',inset:0,background:'#fff',zIndex:3000,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,maxWidth:480,margin:'0 auto',left:'50%',transform:'translateX(-50%)',width:'100%'}}>
          <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}`}</style>
          <div style={{animation:'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',marginBottom:28}}>
            <div style={{width:80,height:80,borderRadius:'50%',background:'#1a1a1a',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto'}}>
              <svg width='36' height='36' viewBox='0 0 24 24' fill='none' stroke='#fff' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'><polyline points='20 6 9 17 4 12'/></svg>
            </div>
          </div>
          <h2 style={{fontFamily:'Poppins,sans-serif',fontSize:24,fontWeight:700,color:'#1a1a1a',marginBottom:10,textAlign:'center'}}>Pedido enviado</h2>
          <p style={{fontSize:13,color:'#aaa',textAlign:'center',lineHeight:1.7,fontFamily:'Poppins,sans-serif',marginBottom:8,maxWidth:280}}>
            Tu pedido fue enviado por WhatsApp. Pronto nos pondremos en contacto contigo.
          </p>
          <div style={{width:40,height:1,background:'#ebebeb',margin:'20px auto'}}/>
          <div style={{background:'#f9f9f9',borderRadius:12,padding:'14px 20px',width:'100%',maxWidth:300,marginBottom:32}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#bbb',fontFamily:'Poppins,sans-serif',marginBottom:8}}>Qué sigue</div>
            {[
              'Recibirás confirmación por WhatsApp',
              'Preparamos tu pedido',
              'Entrega a tu dirección',
            ].map((paso,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:i<2?10:0}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:'#1a1a1a',color:'#fff',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'Poppins,sans-serif'}}>{i+1}</div>
                <span style={{fontSize:12,color:'#555',fontFamily:'Poppins,sans-serif'}}>{paso}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>setPedidoEnviado(false)} style={{
            width:'100%',maxWidth:300,padding:'14px',background:'#1a1a1a',color:'#fff',
            border:'none',borderRadius:12,fontFamily:'Poppins,sans-serif',
            fontSize:13,fontWeight:700,cursor:'pointer'
          }}>Volver al menú</button>
        </div>
      )}

      {/* MODAL PERFIL CLIENTE */}
      {modalPerfilCliente && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:2000,display:'flex',alignItems:'flex-end'}}
          onClick={e=>{if(e.target===e.currentTarget){setModalPerfilCliente(false);setEditandoPerfil(false)}}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,margin:'0 auto',padding:'24px 20px 36px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:36,height:4,background:'#e0e0e0',borderRadius:2,margin:'0 auto 20px'}}/>

            {cliente ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,paddingBottom:16,borderBottom:'1px solid #f0f0f0'}}>
                  <div onClick={()=>fotoClienteRef.current?.click()} style={{
                    width:56,height:56,borderRadius:'50%',background:'#1a1a1a',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    flexShrink:0,cursor:'pointer',overflow:'hidden',position:'relative',
                    border:'2px solid #7C9263'
                  }}>
                    {fotoPerfilCliente
                      ? <img src={fotoPerfilCliente} alt='perfil' style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      : <span style={{color:'#fff',fontSize:22,fontWeight:700}}>{cliente.nombre?.charAt(0)?.toUpperCase()}</span>
                    }
                    <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.45)',fontSize:8,color:'#fff',textAlign:'center',padding:'2px',fontFamily:'Poppins,sans-serif'}}>foto</div>
                  </div>
                  <input type='file' accept='image/*' style={{display:'none'}} ref={fotoClienteRef}
                    onChange={e=>{
                      const file=e.target.files?.[0]; if(!file) return
                      const reader=new FileReader()
                      reader.onload=ev=>{
                        const img=new window.Image()
                        img.onload=()=>{
                          const MAX=200; const scale=Math.min(MAX/img.width,MAX/img.height,1)
                          const canvas=document.createElement('canvas')
                          canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale)
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
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'#1a1a1a'}}>{cliente.nombre}</div>
                    <div style={{fontSize:11,color:'#aaa',marginTop:2,fontFamily:'Poppins,sans-serif'}}>Cliente registrado</div>
                  </div>
                  <button onClick={()=>{
                    setEditNombre(cliente.nombre||'')
                    setEditTelefono(cliente.telefono||'')
                    setEditDireccion(cliente.direccion||'')
                    setEditCedula(cliente.cedula||'')
                    setEditReferencia(cliente.referencia||'')
                    setEditandoPerfil(!editandoPerfil)
                  }} style={{
                    background: editandoPerfil?'#f0f4ff':'#f4f4f4',
                    border: editandoPerfil?'1.5px solid #7C9263':'1px solid #e0e0e0',
                    borderRadius:8,padding:'6px 12px',
                    fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:600,
                    cursor:'pointer',color:editandoPerfil?'#7C9263':'#555'
                  }}>{editandoPerfil ? 'Cancelar' : 'Editar'}</button>
                </div>

                {!editandoPerfil && (
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
                    {[
                      {label:'Teléfono', val:cliente.telefono},
                      {label:'Dirección', val:cliente.direccion},
                      {label:'Referencia', val:cliente.referencia},
                      {label:'Cédula', val:cliente.cedula},
                    ].filter(x=>x.val).map(x=>(
                      <div key={x.label} style={{background:'#f9f9f9',borderRadius:9,padding:'9px 12px'}}>
                        <div style={{fontSize:10,color:'#bbb',fontFamily:'Poppins,sans-serif',letterSpacing:1,textTransform:'uppercase',marginBottom:2}}>{x.label}</div>
                        <div style={{fontSize:13,color:'#1a1a1a',fontFamily:'Poppins,sans-serif'}}>{x.val}</div>
                      </div>
                    ))}
                  </div>
                )}

                {editandoPerfil && (
                  <div style={{marginBottom:20}}>
                    {[
                      {label:'Nombre *', val:editNombre, set:setEditNombre, ph:'Tu nombre completo', type:'text'},
                      {label:'Teléfono *', val:editTelefono, set:setEditTelefono, ph:'09XXXXXXXX', type:'tel'},
                      {label:'Dirección *', val:editDireccion, set:setEditDireccion, ph:'Barrio, calle principal', type:'text'},
                      {label:'Referencia', val:editReferencia, set:setEditReferencia, ph:'Casa azul, portón negro...', type:'text'},
                      {label:'Cédula', val:editCedula, set:setEditCedula, ph:'0000000000', type:'text'},
                    ].map(f=>(
                      <div key={f.label} style={{marginBottom:12}}>
                        <label style={{display:'block',fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'#aaa',marginBottom:5,fontFamily:'Poppins,sans-serif',fontWeight:600}}>{f.label}</label>
                        <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} type={f.type}
                          style={{width:'100%',border:'1.5px solid #e8e8e8',borderRadius:9,fontFamily:'Poppins,sans-serif',fontSize:13,padding:'11px 13px',outline:'none',color:'#1a1a1a',boxSizing:'border-box'}}/>
                      </div>
                    ))}
                    <button disabled={guardandoPerfil} onClick={async ()=>{
                      if(!editNombre||!editTelefono||!editDireccion){showToast('err','Nombre, teléfono y dirección son obligatorios');return}
                      setGuardandoPerfil(true)
                      const perfilActualizado = {...cliente,nombre:editNombre,telefono:editTelefono,direccion:editDireccion,cedula:editCedula,referencia:editReferencia}
                      try {
                        if (cliente._id) await updateDoc(doc(db,'clientes',cliente._id),{nombre:editNombre,telefono:editTelefono,direccion:editDireccion,cedula:editCedula,referencia:editReferencia})
                      } catch(e){}
                      localStorage.setItem('esencial_cliente', JSON.stringify(perfilActualizado))
                      setCliente(perfilActualizado)
                      setEditandoPerfil(false)
                      showToast('ok','Perfil actualizado')
                      setGuardandoPerfil(false)
                    }} style={{
                      width:'100%',padding:'13px',background:guardandoPerfil?'#ccc':'#1a1a1a',color:'#fff',border:'none',borderRadius:11,
                      fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',cursor:guardandoPerfil?'not-allowed':'pointer'
                    }}>{guardandoPerfil?'Guardando...':'Guardar cambios'}</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{textAlign:'center',padding:'16px 0 20px'}}>
                <div style={{width:56,height:56,borderRadius:'50%',background:'#f4f4f4',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                  <svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='#ccc' strokeWidth='1.5'><path d='M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>
                </div>
                <div style={{fontFamily:'Poppins,sans-serif',fontWeight:600,fontSize:15,marginBottom:4,color:'#1a1a1a'}}>Sin perfil</div>
                <div style={{fontSize:12,color:'#aaa',marginBottom:16,fontFamily:'Poppins,sans-serif'}}>Regístrate para guardar tus datos</div>
                <button onClick={()=>{setModalPerfilCliente(false);setModalRegistro(true)}} style={{
                  padding:'10px 24px',background:'#1a1a1a',color:'#fff',border:'none',
                  borderRadius:10,fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'
                }}>Registrarme</button>
              </div>
            )}

            {cliente && !editandoPerfil && (
              <button onClick={()=>{cargarHistorial();setModalHistorial(true)}} style={{
                width:'100%',padding:'12px',background:'#1a1a1a',color:'#fff',
                border:'none',borderRadius:10,fontFamily:'Poppins,sans-serif',
                fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:8,
                display:'flex',alignItems:'center',justifyContent:'center',gap:8
              }}>
                <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><path d='M9 11l3 3L22 4'/><path d='M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'/></svg>
                Mis Pedidos
              </button>
            )}
            {!editandoPerfil && (
              <button onClick={()=>{setModalPerfilCliente(false);onVolver()}} style={{
                width:'100%',padding:'12px',background:'#f4f4f4',color:'#1a1a1a',
                border:'1px solid #ebebeb',borderRadius:10,
                fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'
              }}>← Regresar a Inicio</button>
            )}

          </div>
        </div>
      )}

      {/* MODAL CANCELAR PEDIDO */}
      {modalCancelar && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:320,padding:'28px 24px',boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontSize:16,fontWeight:700,color:'#1a1a1a',marginBottom:10,textAlign:'center'}}>
              Cancelar pedido
            </div>
            <p style={{fontSize:13,color:'#666',lineHeight:1.6,textAlign:'center',marginBottom:24}}>
              estas seguro que deseas cancelar tu pedido? Se eliminaran todos los productos agregados.
            </p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setModalCancelar(false)} style={{
                flex:1,padding:'12px',background:'#fff',color:'#1a1a1a',
                border:'1.5px solid #d0d0d0',borderRadius:9,
                fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'
              }}>Volver</button>
              <button onClick={()=>{setCantidades({});setComprobanteCliente(null);setUrlComprobante(null);setModalCancelar(false);setVistaCliente('menu');
              registrarEvento('pedido_cancelado', {
                origen: 'cliente_app',
                nombre: cliente?.nombre || tmpNombre || 'Sin nombre',
                telefono: cliente?.telefono || tmpTel || ''
              })}} style={{
                flex:1,padding:'12px',background:'#1a1a1a',color:'#fff',
                border:'none',borderRadius:9,
                fontFamily:'Poppins,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'
              }}>Si, cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FAVORITOS */}
      {modalFavoritos && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3500,display:'flex',alignItems:'flex-end'}}
          onClick={e=>{if(e.target===e.currentTarget)setModalFavoritos(false)}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,margin:'0 auto',maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
            {/* Header */}
            <div style={{padding:'20px 20px 14px',borderBottom:'1px solid #f0f0f0',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{fontFamily:'Poppins,sans-serif',fontSize:16,fontWeight:700,color:'#1a1a1a'}}>Favoritos</div>
                <div style={{fontFamily:'Poppins,sans-serif',fontSize:11,color:'#aaa',marginTop:2}}>{favoritos.length} {favoritos.length===1?'producto':'productos'}</div>
              </div>
              <button onClick={()=>setModalFavoritos(false)} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'#bbb'}}>
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>
              </button>
            </div>
            {/* Lista */}
            <div style={{overflowY:'auto',flex:1,padding:'8px 0'}}>
              {favoritos.length === 0 ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'48px 24px',gap:12}}>
                  <svg width='36' height='36' viewBox='0 0 24 24' fill='none' stroke='#ddd' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z'/>
                  </svg>
                  <span style={{fontFamily:'Poppins,sans-serif',fontSize:13,color:'#ccc',textAlign:'center'}}>Aún no tienes favoritos</span>
                  <span style={{fontFamily:'Poppins,sans-serif',fontSize:11,color:'#ddd',textAlign:'center',lineHeight:1.6}}>Presiona el ícono de corazón en la galería para guardar productos</span>
                </div>
              ) : favoritos.map(fav => {
                const cantFav = cantidades[fav.id] || 0
                const menuProd = menu.find(m => m.id === fav.id)
                const imgSrc = menuProd
                  ? (imgError[fav.id] ? (IMGS_CATEGORIA[fav.categoria]||IMGS_CATEGORIA['default']) : getImgProducto(menuProd))
                  : (IMGS_CATEGORIA[fav.categoria]||IMGS_CATEGORIA['default'])
                return (
                  <div key={fav.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',borderBottom:'1px solid #f8f8f8'}}>
                    <div style={{width:52,height:52,borderRadius:10,overflow:'hidden',flexShrink:0,background:'#f5f5f5'}}>
                      <img src={imgSrc} alt={fav.nombre}
                        onError={()=>setImgError(p=>({...p,[fav.id]:true}))}
                        style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:'Poppins,sans-serif',fontSize:13,fontWeight:700,color:'#1a1a1a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fav.nombre}</div>
                      <div style={{fontFamily:'Poppins,sans-serif',fontSize:12,color:'#7C9263',fontWeight:600,marginTop:2}}>${parseFloat(fav.precio).toFixed(2)}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      <button onClick={()=>addCant(fav.id,-1)} style={{width:30,height:30,borderRadius:'50%',border:'1.5px solid #e0e0e0',background:'#fff',color:'#1a1a1a',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <span style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,minWidth:18,textAlign:'center'}}>{cantFav}</span>
                      <button onClick={()=>addCant(fav.id,1)} style={{width:30,height:30,borderRadius:'50%',border:'none',background:'#1a1a1a',color:'#fff',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>+</button>
                    </div>
                    <button onClick={()=>toggleFavorito(fav)} style={{background:'none',border:'none',cursor:'pointer',padding:4,flexShrink:0}}>
                      <svg width='16' height='16' viewBox='0 0 24 24' fill='#c62828' stroke='#c62828' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z'/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
            {/* Footer con total si hay items */}
            {favoritos.some(f => (cantidades[f.id]||0) > 0) && (
              <div style={{padding:'14px 20px',borderTop:'1px solid #f0f0f0',flexShrink:0,background:'#fff'}}>
                <button onClick={()=>{ setModalFavoritos(false); setVistaCliente('pedido') }} style={{
                  width:'100%',padding:'13px',background:'#1a1a1a',color:'#fff',
                  border:'none',borderRadius:12,fontFamily:'Poppins,sans-serif',
                  fontSize:13,fontWeight:700,letterSpacing:0.5,cursor:'pointer'
                }}>Ver pedido</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL IMPORTANTE — aviso antes de enviar a WhatsApp */}
      {modalImportante && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:3500,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{background:'#fff',borderRadius:18,width:'100%',maxWidth:340,overflow:'hidden',boxShadow:'0 12px 40px rgba(0,0,0,0.25)'}}>
            {/* Franja verde */}
            <div style={{background:'#7C9263',padding:'18px 20px 14px',textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:6}}>💸</div>
              <div style={{fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:700,color:'#fff',lineHeight:1.3}}>¡Paga más rápido,{' '}<br/>recibe más rápido!</div>
            </div>
            {/* Cuerpo */}
            <div style={{padding:'20px 22px 24px'}}>
              <p style={{fontFamily:'Poppins,sans-serif',fontSize:13,color:'#555',lineHeight:1.7,textAlign:'center',marginBottom:20}}>
                Adjunta el <strong style={{color:'#1a1a1a'}}>comprobante de la transferencia</strong> en el chat de WhatsApp y tu pedido será entregado mucho más rápido. 🚀
              </p>
              {/* Datos de cuenta */}
              <div style={{background:'#f5f5f5',borderRadius:10,padding:'12px 14px',marginBottom:20,textAlign:'center'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#aaa',marginBottom:4,fontFamily:'Poppins,sans-serif'}}>Banco Pichincha — Ahorros</div>
                <div style={{fontFamily:'Poppins,sans-serif',fontSize:18,fontWeight:700,color:'#1a1a1a',letterSpacing:1}}>2207515308</div>
              </div>
              <button onClick={enviarWhatsApp} style={{
                width:'100%',padding:'14px',background:'#25d366',color:'#fff',
                border:'none',borderRadius:12,fontFamily:'Poppins,sans-serif',
                fontSize:13,fontWeight:700,letterSpacing:0.5,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:10
              }}>
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><path d='M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.04 1.22 2 2 0 012 .04h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z'/></svg>
                Entendido — Enviar pedido
              </button>
              <button onClick={()=>setModalImportante(false)} style={{
                width:'100%',padding:'11px',background:'none',color:'#aaa',
                border:'none',fontFamily:'Poppins,sans-serif',fontSize:12,cursor:'pointer'
              }}>Volver al pedido</button>
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

      {/* BOTÓN REGRESO AL ADMIN */}
      {esPreview && (
        <div style={{position:'fixed',top:66,right:12,zIndex:3000}}>
          <button onClick={()=>onVolver()} style={{
            background:'#1a1a1a',color:'#fff',border:'none',borderRadius:100,
            padding:'8px 14px',display:'flex',alignItems:'center',gap:5,
            fontFamily:'Poppins,sans-serif',fontSize:11,fontWeight:700,
            boxShadow:'0 4px 14px rgba(0,0,0,0.4)',cursor:'pointer',letterSpacing:0.3
          }}>
            <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><polyline points='15 18 9 12 15 6'/></svg>
            Admin
          </button>
        </div>
      )}
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
  if (modo === 'cliente-preview') return <><style>{G}</style><ClienteApp esPreview onVolver={()=>setModo('admin')}/></>
  return <AdminApp onVerComoCliente={()=>setModo('cliente-preview')}/>
}