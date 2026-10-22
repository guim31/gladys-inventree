# InvenTree

Siga su inventario de [InvenTree](https://inventree.org/) en Gladys: los
artículos bajo su stock mínimo, los artículos agotados, los pedidos en curso y
el valor del stock. Las escenas pueden reaccionar cuando un artículo baja de
su mínimo o se recibe un pedido, leer el stock de un artículo y, si usted lo
permite, retirar artículos del stock. Gladys habla directamente con su
servidor InvenTree, en casa o alojado.

Probada con un servidor InvenTree 1.6.1 real (la imagen Docker oficial, con
PostgreSQL). Sus comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.1 o posterior.
- Un servidor InvenTree (versión 1.0 o posterior) accesible desde la máquina
  de Gladys: en su red, o en Internet por HTTPS.
- Un token de API: en InvenTree, abra los ajustes de su usuario,
  **Seguridad**, **Tokens de acceso**, añada un token y cópielo. Un usuario
  dedicado es una buena idea. Sus roles (Admin, Grupos) deciden lo que Gladys
  ve:
  - **Piezas: ver**, obligatorio;
  - **Pedidos de compra: ver**, para los pedidos en curso y recibidos;
  - **Artículos de stock: ver**, para el valor del stock;
  - **Artículos de stock: cambiar**, solo para retirar stock desde una escena.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de InvenTree**, introduzca la dirección que abre en su
   navegador, por ejemplo `http://192.168.1.50:8000` o
   `https://inventree.example.org`.
3. Pegue el **token de API** (con o sin la palabra `Token` delante).
4. **Leer InvenTree cada**: 5, 15 (por defecto), 30 minutos o 1 hora.
5. **Un dispositivo por artículo**: ninguno, los artículos suscritos por el
   usuario del token (la estrella en la página de un artículo, por defecto), o
   todos los artículos con stock mínimo. 50 artículos como máximo.
6. **Permitir que las escenas retiren stock**: desactivado por defecto.
   Actívelo solo si una escena debe retirar artículos de InvenTree.
7. **Idioma de los nombres y mensajes** fija los nombres de las funciones
   (fijados al añadir el dispositivo) y los textos de las acciones de escena.
   Francés por defecto.
8. Guarde y luego use **Probar la conexión**: muestra la versión de InvenTree,
   el número de artículos, los que están bajo el mínimo y los pedidos en
   curso.
9. En la pestaña **Descubrimiento**, añada el dispositivo **InvenTree** y los
   dispositivos de artículos que desee.

## Dispositivos

El dispositivo **InvenTree**:

| Función                  | Significado                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Artículos                | Artículos activos (sin los artículos virtuales)                                      |
| Artículos bajo el mínimo | Artículos con stock mínimo y un stock total estrictamente inferior (regla InvenTree) |
| Artículos agotados       | Artículos con stock mínimo y sin existencias                                         |
| Pedidos en curso         | Pedidos pendientes, realizados o en espera                                           |
| Pedidos atrasados        | Pedidos que han superado su fecha prevista                                           |
| Valor del stock          | Cantidad × precio de compra de los artículos en stock, en la moneda principal        |

Los precios en otra moneda se convierten con los tipos de cambio de
InvenTree; un artículo sin precio no cuenta. El valor tiene la unidad euro,
dólar o libra cuando esa es la moneda principal de InvenTree.

Cada **dispositivo de artículo** (con el nombre del artículo) tiene: cantidad
en stock (con historial), stock mínimo y cantidad pedida. El stock de un
artículo incluye sus variantes, como en InvenTree.

Si el usuario del token no puede ver los pedidos o el stock, esas funciones
quedan vacías, en lugar de mostrar un falso cero.

## Widget del panel

**Artículos a reponer**: mosaicos con los artículos bajo el mínimo, agotados y
los pedidos en curso (en naranja cuando uno está atrasado), y la lista de los
artículos a reponer, los más vacíos primero: cantidad, mínimo, cantidad
pedida.

## Disparadores de escena

- **Artículo bajo el mínimo**: un artículo baja de su stock mínimo. Variables:
  artículo, IPN, categoría, cantidad en stock, stock mínimo, cantidad pedida.
  El artículo se anuncia de nuevo después de volver a su mínimo.
- **Artículo agotado**: un artículo con stock mínimo ya no tiene existencias.
  Variables: artículo, IPN, categoría, stock mínimo, cantidad pedida.
- **Pedido recibido**: un pedido en curso se completa en InvenTree. Variables:
  referencia del pedido, proveedor, descripción, número de líneas.

La primera lectura tras la instalación es silenciosa: lo que ya está bajo no
se anuncia. Un reinicio no anuncia nada dos veces. Como máximo 10 eventos de
cada tipo por lectura (una importación masiva no inunda sus escenas).

## Acciones de escena

- **Leer el stock de un artículo**: indique el artículo por su nombre, su
  IPN, un trozo de nombre que solo tenga un artículo, o su número (`#12`).
  Salidas: cantidad en stock, stock mínimo, cantidad pedida, bajo el mínimo
  (sí/no) y una frase como «Arduino Nano: 2 en stock, mínimo 3, 5 pedidos.».
- **Retirar stock** (solo si está permitido en la configuración): retira una
  cantidad de un artículo, empezando por sus artículos de stock más antiguos,
  y la anota en el historial de InvenTree («Removed by a Gladys Assistant
  scene»). No se retira nada si el stock es insuficiente. Los artículos
  serializados no se tocan. Mismas salidas que la lectura.

## Ejemplos de escenas

- **Lista de la compra**: disparador «Artículo bajo el mínimo» → mensaje
  «Reponer {{triggerEvent.data.part}}: quedan
  {{triggerEvent.data.quantity}} (mínimo {{triggerEvent.data.minimum}})».
- **Paquete recibido**: disparador «Pedido recibido» → mensaje «Pedido
  {{triggerEvent.data.order}} de {{triggerEvent.data.supplier}} recibido».
- **Filamento para la próxima impresión**: cada noche → «Leer el stock de un
  artículo» `PLA negro` → continuar solo si «bajo el mínimo» es verdadero →
  enviar la frase como mensaje.
- **Cápsulas de café**: una pulsación de botón → «Retirar stock»
  `Cápsulas de café`, 1.

## Solución de problemas

- **«Token rechazado»**: el token se ha revocado o ha caducado; cree uno
  nuevo.
- **«El usuario de este token no puede ver los artículos»**: dé al usuario el
  rol **Piezas** (ver), o use el token de otro usuario.
- **«Esta dirección no responde como InvenTree»**: compruebe la dirección (la
  de la interfaz web, con su puerto), y que ningún proxy pida antes un inicio
  de sesión.
- **Ni pedidos ni valor**: al usuario del token le falta el rol **Pedidos de
  compra** o **Artículos de stock** (ver); los registros de la integración lo
  indican una vez.
- **Ningún dispositivo de artículo**: suscríbase a los artículos (estrella)
  con el usuario del token, o elija «Todos los artículos con stock mínimo».
- Registros detallados: ponga la variable `LOG_LEVEL` del contenedor en
  `debug`.

## Límites

- Un solo servidor InvenTree por integración.
- InvenTree no avisa: los cambios llegan a Gladys en la lectura siguiente (15
  minutos por defecto), o enseguida tras una retirada hecha por una escena.
- Un artículo sin stock mínimo nunca está «bajo el mínimo» ni «agotado»: dé un
  mínimo (aunque sea 1) a los artículos que quiera seguir.
- El valor solo cuenta los artículos en stock que tienen precio de compra.
- Los pedidos de venta, las fabricaciones y los demás módulos de InvenTree no
  se siguen.
- Sin relación con el proyecto InvenTree.
