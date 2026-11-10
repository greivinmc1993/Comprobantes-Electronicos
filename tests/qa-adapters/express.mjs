// Adaptador de pruebas: registra las rutas reales sin abrir un servidor HTTP.
// NO se utiliza en la aplicación distribuida.
const routes=[];
export { routes };
export default function express(){
 const app={
  disable(){},use(){},
  get(path,handler){routes.push({method:'GET',path,handler})},
  post(path,handler){routes.push({method:'POST',path,handler})},
  put(path,handler){routes.push({method:'PUT',path,handler})},
  delete(path,handler){routes.push({method:'DELETE',path,handler})},
  listen(port,host,callback){const server={address:()=>({port:port||39000}),on(){return server},close(fn){fn()}};queueMicrotask(callback);return server;}
 };return app;
}
express.json=()=>()=>{};
express.static=()=>()=>{};
