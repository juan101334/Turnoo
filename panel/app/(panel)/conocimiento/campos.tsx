import { Campo } from '@/componentes/formulario';
import { MAX_PREGUNTA, MAX_RESPUESTA } from '@/lib/conocimiento';

/** Pregunta y respuesta, iguales al crear y al editar. */
export function CamposDeEntrada({ prefijo, pregunta = '', respuesta = '' }: { prefijo: string; pregunta?: string; respuesta?: string }) {
  return (
    <>
      <Campo
        id={`${prefijo}-pregunta`}
        name="pregunta"
        etiqueta="Pregunta"
        required
        maxLength={MAX_PREGUNTA}
        defaultValue={pregunta}
        autoComplete="off"
        placeholder="¿Tienen parqueadero?"
        ayuda="Como la haría un cliente. El asistente reconoce otras formas de decir lo mismo."
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${prefijo}-respuesta`} className="text-sm font-medium">
          Respuesta
        </label>
        <textarea
          id={`${prefijo}-respuesta`}
          name="respuesta"
          required
          rows={4}
          maxLength={MAX_RESPUESTA}
          defaultValue={respuesta}
          placeholder="Sí, hay parqueadero gratis frente al local."
          aria-describedby={`${prefijo}-respuesta-ayuda`}
          className="rounded-lg border border-borde bg-superficie px-3 py-2 text-base"
        />
        <p id={`${prefijo}-respuesta-ayuda`} className="text-sm text-suave">
          Lo que el asistente contestará, con tus palabras. Hasta {MAX_RESPUESTA.toLocaleString('es-CO')} caracteres.
        </p>
      </div>
    </>
  );
}
