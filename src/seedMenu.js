import { db } from './firebase.js'
import { collection, addDoc } from 'firebase/firestore'

const menu = [
  { id:'P001', nombre:'HELADOS', descripcion:'Varios Sabores para elegir', precio:1.0, categoria:'Congelados', imagen:'', disponible:true },
  { id:'P002', nombre:'RASPADOS', descripcion:'Varios jarabes para elegir', precio:1.25, categoria:'Congelados', imagen:'', disponible:true },
  { id:'P003', nombre:'CHOCOBANANA', descripcion:'Aderezos y Chocolates', precio:1.0, categoria:'Congelados', imagen:'', disponible:true },
  { id:'P004', nombre:'WAFFLES', descripcion:'Chocolate, frutas, cremas y aderezos', precio:2.5, categoria:'Dulce', imagen:'', disponible:true },
  { id:'P005', nombre:'CREPS', descripcion:'Chocolate, frutas, cremas y aderezos', precio:2.5, categoria:'Dulce', imagen:'', disponible:true },
  { id:'P006', nombre:'FRAPPES', descripcion:'Bebida fria de cafe con varios aderezos', precio:2.0, categoria:'Dulce', imagen:'', disponible:true },
  { id:'P007', nombre:'HAMBURGUESA', descripcion:'Carne, ensalada, salsas, queso + papas', precio:4.0, categoria:'Mixtos', imagen:'', disponible:true },
  { id:'P008', nombre:'HAMBURGUESA HAWAHIANA', descripcion:'Carne, ensalada, salsas, queso, mermelada de mora o piña + papas', precio:4.5, categoria:'Mixtos', imagen:'', disponible:true },
  { id:'P009', nombre:'PICADITAS', descripcion:'Papas, carne, salsas, queso, tocino y ensalada', precio:4.0, categoria:'Mixtos', imagen:'', disponible:true },
  { id:'P010', nombre:'BURRITO', descripcion:'Tortilla, picada de pollo y carne, guacamole, salsas y queso', precio:3.5, categoria:'Mixtos', imagen:'', disponible:true },
  { id:'P011', nombre:'TORTILLA', descripcion:'Tradicional Ecuatoriana de Tiesto', precio:1.0, categoria:'Mixtos', imagen:'', disponible:true },
  { id:'P012', nombre:'JARRA BEBIDA FRIA', descripcion:'Varios frutas para elegir', precio:2.0, categoria:'Bebidas', imagen:'', disponible:true },
  { id:'P013', nombre:'VASO BEBIDA FRIA', descripcion:'Varios frutas para elegir', precio:0.75, categoria:'Bebidas', imagen:'', disponible:true },
  { id:'P014', nombre:'AGUAS', descripcion:'Con gas o sin gas', precio:0.50, categoria:'Bebidas', imagen:'', disponible:true },
]

async function seedMenu() {
  console.log('Cargando menu en Firestore...')
  for (const item of menu) {
    await addDoc(collection(db, 'menu'), item)
    console.log('✓ ' + item.nombre)
  }
  console.log('Menu cargado exitosamente!')
}

seedMenu()