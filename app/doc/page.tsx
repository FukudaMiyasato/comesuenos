import type { Metadata } from "next";
import { classificationInfo } from "@/lib/classify";
import { persistent } from "@/lib/store";
import { transcriptionInfo } from "@/lib/transcribe";

export const metadata: Metadata = { title: "Comechismes · Documentación" };
export const dynamic = "force-dynamic"; // lee la configuración real del servidor en cada visita

function Step({
  n,
  title,
  where,
  chip,
  children,
}: {
  n: number;
  title: string;
  where: string;
  chip?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="step">
      <span className="num">{n}</span>
      <div className="card">
        <div className="head">
          <h3>{title}</h3>
          <span className="where">{where}</span>
        </div>
        <p>{children}</p>
        {chip && <span className="chip">{chip}</span>}
      </div>
    </li>
  );
}

function Branch({ children }: { children: React.ReactNode }) {
  return <li className="branch">{children}</li>;
}

export default function Doc() {
  const stt = transcriptionInfo();
  const llm = classificationInfo();

  return (
    <main className="doc">
      <p className="back">
        <a href="/">← Volver a los círculos</a>
      </p>
      <h1>Comechismes</h1>
      <p className="lead">
        Un dispositivo con ojos que escucha lo que comentan los clientes en un local de comida rápida y dibuja de
        qué aspectos se habla y con qué tono. No guarda ni el audio ni las palabras: solo el tema, el tono y la hora.
      </p>

      <section>
        <h2>Qué es</h2>
        <p>
          Son dos piezas. Un <strong>ESP32-S3</strong> con micrófono y pantalla graba cada frase que oye y la envía
          por WiFi. Esta <strong>web</strong> recibe el audio, lo pasa por dos modelos de IA y se queda únicamente
          con el resultado.
        </p>
        <ul>
          <li>
            Cada círculo es una categoría con un tono: <b className="t pos">azul</b> positivo,{" "}
            <b className="t neg">rojo</b> negativo, <b className="t neu">gris claro</b> neutral.
          </li>
          <li>
            Una misma categoría puede tener varios círculos independientes: uno azul por las veces que se habló bien
            y otro rojo por las veces que se habló mal.
          </li>
          <li>Cuantas más veces se habló, más grande es el círculo. Al pulsarlo muestra cuándo fue creciendo.</li>
          <li>Cuando entra algo nuevo, sus círculos brillan y palpitan.</li>
          <li>
            El interruptor de arriba a la derecha cambia a la vista de <strong>24 horas</strong>: una línea de tiempo
            vertical con los temas de cada hora y, encima, los más hablados del día.
          </li>
          <li>
            En <a href="/admin">/admin</a> se puede dormir el dispositivo (no se usa ningún modelo y no hay coste) y
            activar datos falsos de demostración.
          </li>
        </ul>
      </section>

      <section>
        <h2>
          Privacidad <span className="tag idea">Qué se guarda</span>
        </h2>
        <p>
          Por motivos legales <strong>no se guarda ni el audio ni la transcripción</strong>. El texto existe solo en
          la memoria del servidor durante los pocos segundos que dura el análisis y después se descarta. Tampoco se
          devuelve al dispositivo ni se escribe en los registros.
        </p>
        <p>
          Lo único que queda guardado por cada frase es: <strong>categoría</strong>, <strong>sentimiento</strong> y{" "}
          <strong>fecha y hora</strong>. Con eso no se puede reconstruir lo que se dijo.
        </p>
        <p>
          Sí hay que tener en cuenta que, para analizarlo, el audio y el texto se envían a los servicios de IA
          externos que aparecen en el flujo de abajo, sujetos a sus propias condiciones de tratamiento de datos.
        </p>
      </section>

      <section>
        <h2>Cómo funciona la IA</h2>
        <p>
          Cada audio pasa por <strong>dos llamadas a modelos</strong>: una para transcribir y otra que resuelve a la
          vez el sentimiento y las categorías. No hay una llamada separada para cada cosa.
        </p>

        <ol className="flow">
          <Step n={1} title="Escucha y grabación" where="Dispositivo">
            El micrófono se lee sin parar. Cuando el volumen supera el ruido de fondo empieza a grabar, y corta tras
            1,2 s de silencio o a los 15 s. No interviene ningún modelo: es una regla de volumen.
          </Step>
          <Step n={2} title="Envío del audio" where="Dispositivo → web">
            El audio viaja como un archivo WAV a <code>POST /api/audio</code>.
          </Step>
          <Step n={3} title="¿Está en pausa?" where="Web">
            Se mira el interruptor antes de gastar nada.
          </Step>
          <Branch>Si está en pausa: el audio se descarta, el dispositivo se duerme y el flujo termina aquí.</Branch>
          <Step
            n={4}
            title="Transcripción: voz a texto"
            where="Modelo 1"
            chip={stt ? `${stt.provider} · ${stt.model}` : "Sin clave configurada en este servidor"}
          >
            El WAV se envía a un modelo Whisper, que devuelve la frase escrita. Se le indica el idioma esperado
            (español) para que acierte más.
          </Step>
          <Branch>Si no se reconoce ninguna palabra: no se guarda nada y el flujo termina aquí.</Branch>
          <Step n={5} title="Categorías que ya existen" where="Web">
            Se parte de seis temas fijos de un local de comida rápida (limpieza, atención, local, comida, variedad y
            bulla) y se añaden las categorías que se hayan ido creando, de la más frecuente a la menos.
          </Step>
          <Step
            n={6}
            title="Sentimiento y categorías, en una sola llamada"
            where="Modelo 2"
            chip={
              llm
                ? `${llm.provider} · ${llm.model}${llm.fallbacks.length ? ` (reserva: ${llm.fallbacks.join(", ")})` : ""}`
                : "Sin clave configurada en este servidor"
            }
          >
            Un modelo de chat pequeño recibe la frase y la lista de categorías existentes, con la indicación de que
            son comentarios de clientes en el local. Devuelve un JSON con el sentimiento (positivo, neutral o
            negativo) y de 1 a 3 categorías. La instrucción le obliga a reutilizar una existente si encaja y a crear
            una nueva solo si ninguna sirve (por ejemplo «precio» o «espera»). Lo que no trata del local va a «otros».
          </Step>
          <Branch>
            Si esta llamada falla: no se guarda nada y la frase se pierde.
          </Branch>
          <Step
            n={7}
            title="Guardado: solo tema, tono y hora"
            where="Web"
            chip={persistent ? "Upstash Redis" : "Memoria del proceso (modo local)"}
          >
            A cada categoría devuelta se le suma un punto en su círculo del color correspondiente y se anota la fecha.
            Si la categoría es nueva, se crea. El texto y el audio se descartan aquí.
          </Step>
          <Step n={8} title="Dibujo" where="Navegador">
            La página consulta los datos cada 3 s y actualiza los círculos o la línea de 24 horas. Lo nuevo palpita.
          </Step>
        </ol>

        <h3 className="sub">Por qué una sola llamada para clasificar</h3>
        <p>
          Sentimiento y categoría se piden juntos porque así se paga una vez por frase en lugar de dos, y porque el
          modelo decide mejor el tema cuando ya ha leído el tono. Se usa el modelo de chat más barato disponible, con
          la respuesta limitada a un JSON corto.
        </p>
        <p>
          La lista de categorías existentes sale de los propios contadores guardados: cada vez que el modelo propone
          una nueva, queda disponible para que las siguientes frases la reutilicen.
        </p>
      </section>

      <section>
        <h2>
          Evals <span className="tag idea">Propuesta, aún no existe</span>
        </h2>
        <p>
          Hoy no hay forma de saber si un cambio de modelo o de instrucciones mejora o empeora el resultado, salvo
          mirando los círculos. Una evaluación automática lo convertiría en números.
        </p>

        <h3 className="sub">1. Un conjunto de referencia</h3>
        <p>
          Entre 50 y 200 frases reales (grabadas con el propio dispositivo) revisadas a mano. Para cada una se anota
          el texto correcto, el sentimiento correcto y las categorías aceptables. Como el sistema no conserva audios
          ni textos, este conjunto habría que grabarlo aparte y con consentimiento expreso.
        </p>

        <h3 className="sub">2. Qué se mide en cada etapa</h3>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Medida</th>
                <th>Qué responde</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Grabación</td>
                <td>Frases cortadas o perdidas</td>
                <td>¿El dispositivo capta la frase entera?</td>
              </tr>
              <tr>
                <td>Transcripción</td>
                <td>Tasa de error por palabra (WER)</td>
                <td>¿Cuántas palabras salen mal?</td>
              </tr>
              <tr>
                <td>Sentimiento</td>
                <td>Aciertos y matriz de confusión</td>
                <td>¿Confunde neutral con negativo?</td>
              </tr>
              <tr>
                <td>Categorías</td>
                <td>Aciertos y tasa de reutilización</td>
                <td>¿Usa la existente o inventa «oficina» teniendo «trabajo»?</td>
              </tr>
              <tr>
                <td>Todo el flujo</td>
                <td>Coste y tiempo por audio</td>
                <td>¿Cuánto cuesta y tarda cada frase?</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="sub">3. Cómo se ejecutaría</h3>
        <ul>
          <li>
            Un script recorre el conjunto, llama a las mismas funciones que usa la web y compara con lo anotado.
          </li>
          <li>
            Se evalúa cada etapa por separado y también de punta a punta, porque un error de transcripción arrastra
            la clasificación.
          </li>
          <li>
            Para las categorías, donde hay más de una respuesta válida, un segundo modelo puede actuar de juez con una
            rúbrica fija; una muestra de sus veredictos se revisa a mano para comprobar que el juez acierta.
          </li>
          <li>
            Se ejecuta antes de cambiar de modelo o de instrucciones, y el resultado se compara con el anterior para
            no desplegar una regresión.
          </li>
        </ul>

        <h3 className="sub">4. Fragmentación de categorías</h3>
        <p>
          El riesgo propio de este sistema es que las categorías se multipliquen con el tiempo. Una prueba específica
          enviaría las mismas frases en distinto orden y mediría cuántas categorías distintas aparecen: lo ideal es
          que el número sea estable y no dependa del orden de llegada.
        </p>
      </section>

      <section className="future">
        <h2>
          Modelos locales sin coste <span className="tag wish">Futuro deseado</span>
        </h2>
        <p>
          Hoy cada frase se paga dos veces (transcripción y clasificación) y, aunque no se guarde, el audio sale de
          casa hacia servicios externos para analizarse. La meta es que los modelos corran en un equipo propio: sin
          coste por uso y sin que la voz salga de la red local.
        </p>

        <ol className="flow local">
          <Step n={1} title="Mismo dispositivo" where="ESP32">
            No cambia: escucha, graba y envía el WAV. Solo cambia la dirección a la que lo manda.
          </Step>
          <Step n={2} title="Servidor en casa" where="Mac, mini PC o Raspberry Pi">
            Un equipo siempre encendido en la misma red recibe el audio en lugar de la web pública.
          </Step>
          <Step n={3} title="Transcripción local" where="Modelo 1" chip="Whisper de código abierto (whisper.cpp o faster-whisper)">
            El mismo tipo de modelo que hoy se paga, ejecutado en el equipo. Un tamaño pequeño o mediano basta para
            frases cortas en español.
          </Step>
          <Step n={4} title="Clasificación local" where="Modelo 2" chip="Modelo de lenguaje pequeño servido con Ollama o similar">
            Un modelo abierto de pocos miles de millones de parámetros recibe la misma instrucción que hoy y devuelve
            el mismo JSON.
          </Step>
          <Step n={5} title="Solo el resultado sale a internet" where="Servidor en casa → web">
            A la web se envía únicamente la categoría, el sentimiento y la hora. Ni el audio ni el texto salen de
            casa, y la web deja de llamar a modelos: solo guarda y dibuja.
          </Step>
        </ol>

        <h3 className="sub">Qué habría que resolver</h3>
        <ul>
          <li>
            <strong>Calidad:</strong> los modelos pequeños se equivocan más. Las evals de la sección anterior son las
            que dirían si el cambio es aceptable.
          </li>
          <li>
            <strong>Velocidad:</strong> en un equipo modesto cada frase puede tardar varios segundos en vez de uno.
          </li>
          <li>
            <strong>Disponibilidad:</strong> si el equipo de casa se apaga, no se procesa nada. Se podría mantener el
            servicio de pago como reserva.
          </li>
          <li>
            <strong>Categorías sin modelo de lenguaje:</strong> otra vía es convertir cada frase en un vector y
            agruparla con las más parecidas, lo que evita por completo la segunda llamada.
          </li>
        </ul>
        <p>
          El código ya está preparado para este cambio: la transcripción y la clasificación hablan con sus servicios
          a través de una interfaz estándar, así que apuntar a un servidor local es sobre todo cambiar una dirección.
        </p>
      </section>
    </main>
  );
}
