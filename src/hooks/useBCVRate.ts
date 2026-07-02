import { useState, useEffect } from 'react';
import { doc, onSnapshot } from '../firebase';
import { db } from '../firebase';

interface BCVResponse {
  promedio: number;
  actualizacion: string;
}

export function useBCVRate() {
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Escuchar el documento de configuración de tasa en Firestore
    const docRef = doc(db, 'settings', 'rate');
    const unsubscribe = onSnapshot(docRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (typeof data.rate === 'number') {
          setRate(data.rate);
          setLoading(false);
          return;
        }
      }
      
      // Si no existe el documento o no tiene tasa, usamos la api oficial
      try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (response.ok) {
          const data: BCVResponse = await response.json();
          setRate(data.promedio);
        } else {
          setRate(40.0); // Tasa fallback razonable
        }
      } catch (err) {
        console.error(err);
        setRate(40.0);
        setError('No se pudo cargar la tasa oficial, usando tasa fallback.');
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error("Error al escuchar tasa en Firestore:", err);
      // Fallback a API externa si Firestore falla
      fetch('https://ve.dolarapi.com/v1/dolares/oficial')
        .then(res => res.json())
        .then(data => {
          setRate(data.promedio);
          setLoading(false);
        })
        .catch(() => {
          setRate(40.0);
          setLoading(false);
        });
    });

    return () => unsubscribe();
  }, []);

  return { rate, loading, error };
}

