import { supabase } from './supabase';

export const db = {};
export const auth = {}; // for compat
export const googleProvider = {}; // for compat

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  console.error(`Firebase-Supabase Adapter Error: ${operationType} on ${path}`, error);
  throw error;
}

export interface DocRef {
  collection: string;
  id: string;
}

export interface CollectionRef {
  collection: string;
}

export function doc(db: any, collectionName: string, id?: string): DocRef {
  if (!id) {
     id = crypto.randomUUID();
  }
  const colName = typeof collectionName === 'object' ? (collectionName as any).collection : collectionName;
  return { collection: colName, id };
}

export function collection(db: any, collectionName: string): CollectionRef {
  return { collection: collectionName };
}

function getTableName(collectionName: string) {
  if (collectionName === 'menuItems') return 'menu_items';
  if (collectionName === 'dailyExpenses') return 'daily_expenses';
  if (collectionName === 'inventoryMovements') return 'inventory_movements';
  return collectionName;
}

export async function setDoc(docRef: DocRef, data: any, options?: { merge?: boolean }) {
  const tableName = getTableName(docRef.collection);
  const payload = { id: docRef.id, ...data };
  
  const { error } = await supabase.from(tableName).upsert(payload);
  if (error) throw error;
}

export async function updateDoc(docRef: DocRef, data: any) {
  const tableName = getTableName(docRef.collection);
  const { error } = await supabase.from(tableName).update(data).eq('id', docRef.id);
  if (error) throw error;
}

export async function deleteDoc(docRef: DocRef) {
  const tableName = getTableName(docRef.collection);
  const { error } = await supabase.from(tableName).delete().eq('id', docRef.id);
  if (error) throw error;
}

export function writeBatch(db: any) {
  const operations: (() => Promise<any>)[] = [];
  return {
    set: (docRef: DocRef, data: any, options?: any) => {
      operations.push(() => setDoc(docRef, data, options));
    },
    update: (docRef: DocRef, data: any) => {
      operations.push(() => updateDoc(docRef, data));
    },
    delete: (docRef: DocRef) => {
      operations.push(() => deleteDoc(docRef));
    },
    commit: async () => {
      for (const op of operations) {
        await op();
      }
    }
  };
}

export function onSnapshot(ref: DocRef | CollectionRef | Query, callback: (snapshot: any) => void, errorCallback?: (error: any) => void) {
  const collectionName = (ref as any).collection;
  const tableName = getTableName(collectionName);

  let queryReq = supabase.from(tableName).select('*');
  
  if ((ref as DocRef).id) {
    queryReq = queryReq.eq('id', (ref as DocRef).id);
    queryReq.single().then(({ data }) => {
      if (data) {
        callback({ exists: () => true, data: () => data, id: data.id, ref: { collection: collectionName, id: data.id } });
      } else {
        callback({ exists: () => false, data: () => undefined, id: (ref as DocRef).id, ref: { collection: collectionName, id: (ref as DocRef).id } });
      }
    });

    const channel = supabase.channel(`${tableName}_${(ref as DocRef).id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName, filter: `id=eq.${(ref as DocRef).id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
           callback({ exists: () => false, data: () => undefined, id: (ref as DocRef).id, ref: { collection: collectionName, id: (ref as DocRef).id } });
        } else {
           callback({ exists: () => true, data: () => payload.new, id: payload.new.id, ref: { collection: collectionName, id: payload.new.id } });
        }
      }).subscribe();
      
    return () => { supabase.removeChannel(channel); };
  } 

  queryReq.then(({ data }) => {
    if (data) {
       let results = data;
       if ((ref as Query).isQuery) {
         if ((ref as Query).orderByField) {
            results.sort((a,b) => {
               const valA = a[(ref as Query).orderByField!];
               const valB = b[(ref as Query).orderByField!];
               if (valA < valB) return (ref as Query).orderDir === 'asc' ? -1 : 1;
               if (valA > valB) return (ref as Query).orderDir === 'asc' ? 1 : -1;
               return 0;
            });
         }
         if ((ref as Query).limitCount) {
            results = results.slice(0, (ref as Query).limitCount);
         }
       }
       const docs = results.map(d => ({ id: d.id, data: () => d, ref: { collection: collectionName, id: d.id } }));
       callback({
         docs,
         forEach: (cb: any) => docs.forEach(cb),
         empty: docs.length === 0
       });
    }
  });

  const channel = supabase.channel(`${tableName}_all_${Math.random()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
      let req = supabase.from(tableName).select('*');
      if ((ref as Query).isQuery) {
         if ((ref as Query).orderByField) {
            req = req.order((ref as Query).orderByField!, { ascending: (ref as Query).orderDir === 'asc' });
         }
         if ((ref as Query).limitCount) {
            req = req.limit((ref as Query).limitCount!);
         }
      }
      req.then(({ data }) => {
         if (data) {
           const docs = data.map(d => ({ id: d.id, data: () => d, ref: { collection: collectionName, id: d.id } }));
           callback({ 
             docs,
             forEach: (cb: any) => docs.forEach(cb),
             empty: docs.length === 0
           });
         }
      });
    }).subscribe();

  return () => { supabase.removeChannel(channel); };
}

export interface Query {
  isQuery: true;
  collection: string;
  orderByField?: string;
  orderDir?: 'asc' | 'desc';
  limitCount?: number;
}

export function query(collectionRef: CollectionRef, ...constraints: any[]): Query {
  let q: Query = { isQuery: true, collection: collectionRef.collection };
  for (const c of constraints) {
    if (c.type === 'orderBy') {
      q.orderByField = c.field;
      q.orderDir = c.dir;
    }
    if (c.type === 'limit') {
      q.limitCount = c.limit;
    }
  }
  return q;
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, dir };
}

export function limit(count: number) {
  return { type: 'limit', limit: count };
}

export async function getDocs(queryObj: Query | CollectionRef) {
  const collectionName = queryObj.collection;
  const tableName = getTableName(collectionName);

  let req = supabase.from(tableName).select('*');
  if ((queryObj as Query).isQuery) {
     const q = queryObj as Query;
     if (q.orderByField) req = req.order(q.orderByField, { ascending: q.orderDir === 'asc' });
     if (q.limitCount) req = req.limit(q.limitCount);
  }

  const { data, error } = await req;
  if (error) throw error;

  const docs = (data || []).map(d => ({
      id: d.id,
      data: () => d,
      ref: { collection: collectionName, id: d.id }
  }));

  return {
    empty: docs.length === 0,
    docs,
    forEach: (cb: any) => docs.forEach(cb)
  };
}

export function where(field: string, op: string, value: any) {
   return { type: 'where', field, op, value };
}

export async function getDoc(docRef: DocRef) {
  const tableName = getTableName(docRef.collection);
  const { data, error } = await supabase.from(tableName).select('*').eq('id', docRef.id).single();
  
  if (error || !data) {
     return { exists: () => false, data: () => undefined, id: docRef.id, ref: { collection: docRef.collection, id: docRef.id } };
  }
  return { exists: () => true, data: () => data, id: docRef.id, ref: { collection: docRef.collection, id: docRef.id } };
}
