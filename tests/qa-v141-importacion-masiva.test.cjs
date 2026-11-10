const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const modulePath=path.resolve(__dirname,'../frontend/src/components/asignacion-masiva.mjs');
const datos=[
  {indice:0,estado:'listo',empresasCompatibles:[1]},
  {indice:1,estado:'requiere_empresa',empresasCompatibles:[]},
  {indice:2,estado:'listo',empresasCompatibles:[1]},
  {indice:3,estado:'error',empresasCompatibles:[]},
  {indice:4,estado:'duplicado_en_lote',empresasCompatibles:[1]},
];
const a={id:1,nombre:'Empresa A',cedula:'3101000011'};
const b={id:2,nombre:'Empresa B',cedula:''};
test('Asignación masiva con cédula solo asigna XML compatibles',async()=>{
 const {asignarEmpresaMasiva}=await import(modulePath);
 const res=asignarEmpresaMasiva(datos,{3:true,4:true},{0:'',1:'',2:''},a);
 assert.equal(res.aplicados,2);assert.equal(res.incompatibles,1);assert.equal(res.omitidos,2);
 assert.equal(res.selecciones[0],'1');assert.equal(res.selecciones[1],'');assert.equal(res.selecciones[2],'1');
});
test('Con perfil sin cédula se permite elegir destino para documentos seleccionados',async()=>{
 const {asignarEmpresaMasiva}=await import(modulePath);
 const res=asignarEmpresaMasiva(datos,{0:true,3:true,4:true},{2:'1'},b);
 assert.equal(res.aplicados,2);assert.equal(res.selecciones[2],'2');assert.equal(res.selecciones[1],'2');
 assert.equal(res.selecciones[0],undefined);
});
test('No cambia documentos desmarcados ni los que tienen error de lectura',async()=>{
 const {asignarEmpresaMasiva}=await import(modulePath);
 const res=asignarEmpresaMasiva(datos,{1:true,3:true,4:true},{0:'1',1:'1',3:'9'},b);
 assert.equal(res.selecciones[0],'2');assert.equal(res.selecciones[1],'1');assert.equal(res.selecciones[3],'9');
});
test('Validación para empresa con cédula no admite documento ajeno',async()=>{
 const {empresaCompatible}=await import(modulePath);
 assert.equal(empresaCompatible(datos[0],a),true);assert.equal(empresaCompatible(datos[1],a),false);
 assert.equal(empresaCompatible(datos[1],b),true);assert.equal(empresaCompatible(datos[1],null),false);
});
