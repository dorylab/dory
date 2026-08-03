# Cuando los agentes empiezan a escribir SQL, necesitamos algo más que un servidor MCP de bases de datos

[English](./product-positioning.md) | [简体中文](./product-positioning-cn.md) | [Español](./product-positioning-es.md) | [日本語](./product-positioning-jp.md)

> **Dory is an AI-native SQL client for humans and agents. Query, explore, visualize, and open agent database work as editable SQL workspaces.**

Los clientes SQL antes pertenecían por completo a las personas. Una persona se conectaba a la base de datos, leía el esquema, escribía consultas, examinaba los resultados y convertía sus conclusiones en gráficos o informes.

Ahora los agentes también están entrando en ese flujo de trabajo. Pueden comprender una pregunta, explorar el esquema de una base de datos, generar SQL y completar en minutos un análisis que antes requería muchos pasos manuales. Pero esto crea un nuevo problema: si el agente solo deja un fragmento de SQL y unas cuantas filas de resultados en una ventana de chat, seguimos teniendo una respuesta desechable, no un trabajo de datos que alguien pueda revisar y continuar.

Ese es el problema que Dory quiere resolver.

Dory es un cliente SQL AI-native para personas y agentes. Funciona como espacio de trabajo SQL cotidiano para desarrolladores, analistas e ingenieros de datos, y también como capa de trabajo con bases de datos para agentes como Codex CLI y Claude Code a través de MCP.

A diferencia de un servidor MCP de bases de datos convencional, Dory no se limita a ejecutar una consulta y devolver su resultado. Convierte la actividad del agente en un espacio de trabajo SQL real y editable. Una persona puede abrir las pestañas SQL creadas por el agente, examinar las sentencias y los ResultSets exactos, revisar filtros y gráficos, corregir una consulta y continuar desde el mismo contexto.

## Los agentes deberían entregar trabajo, no solo respuestas

En el trabajo real con datos, obtener una respuesta suele ser apenas el principio.

Necesitamos saber qué tablas utilizó el agente, cómo interpretó las columnas, qué SQL ejecutó realmente, si el resultado está completo y si alguna unión, condición o agregación es incorrecta. Cuando encontramos un problema, necesitamos editar el SQL, volver a ejecutarlo, comparar resultados, crear un gráfico, exportar los datos o guardar una consulta útil para más adelante.

Cuando todo ese proceso existe únicamente en un historial de chat, las personas se ven obligadas a copiar contenido entre el agente, una herramienta de base de datos y un documento. El contexto de ejecución se pierde con facilidad, los resultados se separan del SQL que los generó y la siguiente persona tiene que reconstruir el análisis desde cero.

Dory organiza este trabajo en un Agent Run: un contexto persistente para una tarea de base de datos que puede incluir la conexión, la exploración del esquema, pestañas SQL, resultados, gráficos, Saved Queries y una línea de tiempo de ejecución. Un agente puede empezar allí y una persona puede abrir el mismo espacio de trabajo y tomar el control en cualquier momento.

El resultado deja de ser un mensaje sin continuidad. Se convierte en un trabajo que se puede inspeccionar, editar y reutilizar.

## De una consulta aislada a un espacio de trabajo que puedes retomar

Imagina que quieres entender por qué una métrica de producto cambió recientemente.

Un agente puede usar Dory para enumerar las conexiones disponibles, explorar el esquema relevante, confirmar las tablas y sus relaciones, y ejecutar después SQL de solo lectura para validar sus hipótesis. Cada consulta mantiene juntos el SQL y su ResultSet, en lugar de enviar al chat únicamente una respuesta recortada.

Después puedes abrir el Agent Run en Dory y:

- comprobar qué tablas y filtros utilizó realmente el agente;
- revisar los ResultSets reales generados por varias consultas;
- editar el SQL y volver a ejecutarlo en la misma pestaña;
- buscar, ordenar y filtrar los datos devueltos;
- visualizar los resultados como gráficos de barras, líneas, sectores, dispersión, histogramas o mapas de calor;
- exportar el resultado o guardar la consulta para reutilizarla.

No es necesario copiar SQL desde el chat a otro cliente ni volver a explicar el contexto a la siguiente persona. Humanos y agentes trabajan con las mismas capacidades de base de datos y sobre el mismo trabajo subyacente.

## AI-native no significa ocultar SQL

Muchos productos de datos con IA intentan hacer desaparecer SQL. Dory adopta la posición contraria: SQL es una de las interfaces de colaboración más importantes entre personas y agentes.

El lenguaje natural es adecuado para expresar una intención. SQL ofrece un registro preciso y verificable de lo que se va a ejecutar. Un cliente SQL verdaderamente AI-native no debería sustituir SQL por una respuesta que parece incuestionable. Debería ayudar a los agentes a generar y organizar SQL con eficiencia, preservando la capacidad de una persona para revisarlo y modificarlo.

Por eso el AI Assistant de Dory trabaja con el esquema real de la base de datos y el contexto de la pestaña actual. Puede generar SQL a partir de lenguaje natural y explicar, reescribir o corregir una consulta existente. La IA no queda aislada en un chat fuera del flujo de datos: opera dentro del espacio de trabajo SQL que las personas utilizan realmente.

Schema Explorer aplica el mismo modelo de colaboración. Las personas pueden explorar tablas, columnas y objetos de base de datos, y usar un gráfico de relaciones para entender claves primarias, claves foráneas y vínculos entre tablas. Los agentes pueden explorar el mismo esquema a través de MCP y construir consultas a partir de la estructura real. El gráfico admite búsqueda, disposición automática y exportación a PNG o SVG, lo que facilita comprender y explicar bases de datos desconocidas.

## Capacidades para los agentes, con límites de seguridad claros

Permitir que un agente se conecte a una base de datos no significa renunciar al control.

Dory proporciona a los agentes una herramienta SQL explícitamente de solo lectura. Los agentes pueden enumerar conexiones, explorar esquemas, previsualizar tablas, leer Saved Queries y realizar análisis de solo lectura. Las operaciones que crean, actualizan o eliminan recursos de Dory requieren permisos de escritura independientes y una aprobación explícita.

Schema Compare sigue el mismo principio. Puede leer metadatos de catálogo y realizar comparaciones deterministas entre bases de datos de una misma familia de dialectos, incluidas PostgreSQL, Neon, Supabase, MySQL, MariaDB, SQLite y Cloudflare D1. Identifica cambios en tablas, columnas, índices, restricciones y vistas, y conserva la evidencia que respalda su evaluación de riesgo. No lee filas de la aplicación, no genera SQL de migración y no modifica ninguna de las bases de datos conectadas.

La seguridad no debería depender de la promesa de que una IA tendrá cuidado. Debe expresarse mediante límites de producto que las personas puedan entender y configurar.

## Un producto, varias formas de trabajar

Dory es compatible con PostgreSQL, ClickHouse, MySQL, MariaDB, SQLite, DuckDB, Cloudflare D1, Neon, Supabase, SQL Server, Oracle y Snowflake. Para ClickHouse, Dory ofrece además capacidades operativas más profundas, como monitorización de consultas, análisis de consultas lentas y errores, gestión de usuarios y roles, y operaciones de privilegios a nivel de clúster.

Dory puede utilizarse como aplicación de escritorio o como despliegue web autohospedado. `@getdory/cli` proporciona un runtime headless independiente capaz de exponer MCP mediante stdio o HTTP, mientras que un despliegue existente de Dory Web puede conectarse con agentes locales a través de un Hosted Bridge.

Esto permite integrar Dory en el entorno local de un desarrollador, en un servicio compartido por un equipo de datos, en infraestructura autohospedada o en flujos automatizados, manteniendo el mismo espacio de trabajo SQL y las mismas capacidades de base de datos.

Dory es software de código abierto bajo la licencia Apache-2.0. Creemos que el siguiente paso de las herramientas de bases de datos no consiste en eliminar a las personas del flujo de trabajo, sino en permitir que humanos y agentes colaboren en un espacio visible, editable y continuo.

El valor de un cliente SQL AI-native no consiste en ocultar SQL. Consiste en incorporar el trabajo de los agentes con bases de datos a un proceso que las personas puedan revisar y continuar.

**Deja que los agentes comiencen el trabajo. Deja que las personas tomen el control en cualquier momento.**

Empieza ahora:

- [Prueba Dory en línea](https://app.getdory.dev)
- [Visita Dory en GitHub y dale una estrella al proyecto](https://github.com/dorylab/dory)
- Instala en macOS: `brew install dorylab/dory/dory`
- Autohospeda Dory Web con Docker o Docker Compose
