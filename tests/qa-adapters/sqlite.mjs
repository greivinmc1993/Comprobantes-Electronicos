// Adaptador de pruebas para ejecutar las consultas SQLite reales de FacturaCR
// mediante node:sqlite, sin compilar el módulo nativo better-sqlite3.
import {DatabaseSync, backup} from 'node:sqlite';
export default class Database {
 constructor(file,options={}){
  this.db=new DatabaseSync(file,{readOnly:!!options.readonly,allowExtension:false});
 }
 exec(sql){return this.db.exec(sql)}
 prepare(sql){const s=this.db.prepare(sql);return {get:(...a)=>s.get(...a),all:(...a)=>s.all(...a),run:(...a)=>s.run(...a)}}
 pragma(statement,options={}){const result=this.db.prepare(`PRAGMA ${statement}`).all();return options.simple?Object.values(result[0]||{})[0]:result}
 transaction(fn){return (...args)=>{this.db.exec('BEGIN IMMEDIATE');try{const result=fn(...args);this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}}
 backup(destination){return backup(this.db,destination)}
 close(){this.db.close()}
}
