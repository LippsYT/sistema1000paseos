# Resumen de Permisos por Rol

Este documento detalla las capacidades y restricciones de cada rol de usuario dentro del sistema de gestión de 1000 Paseos. La lógica de permisos se encuentra centralizada en `src/lib/permissions.ts`.

---

### 1. Super Administrador (`super-admin`)

Es el rol con el nivel más alto de acceso. No tiene ninguna restricción y puede realizar todas las acciones disponibles en el sistema.

- **Acceso Total:** Puede ver y modificar cualquier configuración, dato o registro.
- **Gestión de Usuarios:** Es el único rol que puede crear, editar y eliminar otros usuarios, incluidos otros administradores.
- **Configuración del Sistema:** Puede cambiar el nombre y el logo de la aplicación.
- **Control Financiero Completo:** Tiene acceso a todas las funcionalidades de pago, liquidaciones y reportes.

**Ideal para:** El dueño o el principal responsable técnico del sistema.

---

### 2. Administrador (`admin`)

Es un rol de alta confianza con amplios permisos para la gestión operativa diaria, pero con algunas limitaciones en la configuración crítica del sistema.

- **Gestión de Entidades:** Puede crear, editar y eliminar Agencias, Proveedores, Guías y Vehículos.
- **Gestión de Pagos:** Puede generar liquidaciones, confirmar pagos recibidos y archivar cierres de cuenta.
- **Revisión de Reservas:** Tiene acceso a la página de "Revisión" para aprobar o corregir reservas que requieren atención.
- **Operaciones Diarias:** Puede gestionar el armado diario, asignando reservas a guías y vehículos.
- **Limitaciones:** No puede gestionar usuarios ni la configuración general de la aplicación.

**Ideal para:** Personal administrativo de confianza que gestiona las operaciones del día a día.

---

### 3. Agente (`agent`)

Este rol está diseñado para el personal de las agencias de viajes que utilizan el sistema para hacer reservas. Su acceso está limitado a la información de su propia agencia.

- **Creación de Reservas:** Puede crear y editar reservas para la agencia a la que pertenece.
- **Gestión de Liquidaciones:** Puede ver las liquidaciones generadas para su agencia y notificar cuándo ha realizado un pago (subiendo un comprobante).
- **Visibilidad Limitada:** No puede ver la información, reservas o liquidaciones de otras agencias.

**Ideal para:** El personal de una agencia de viajes que necesita autogestionar sus reservas.

---

### 4. Vendedor (`vendedor`)

Es una versión más restringida del rol de Agente, enfocado puramente en la creación de reservas.

- **Creación de Reservas:** Puede crear reservas para la agencia a la que pertenece.
- **Sin Acceso a Pagos:** A diferencia del Agente, el Vendedor no tiene acceso a la sección de "Pagos", por lo que no puede ver liquidaciones ni informar pagos.
- **Visibilidad Limitada:** Al igual que el Agente, solo puede ver la información de su propia agencia.

**Ideal para:** Vendedores o personal de una agencia que solo necesitan cargar reservas sin involucrarse en la parte financiera.

---

### 5. Guía (`guia`)

Este rol está diseñado para los guías turísticos y está enfocado en sus tareas y perfil personal.

- **Gestión de Perfil:** Puede editar su propia información de contacto, idiomas, tarifas y foto de perfil.
- **Disponibilidad:** Puede gestionar su calendario de disponibilidad para que los administradores sepan cuándo puede trabajar.
- **Agenda Diaria:** Puede ver las reservas y recogidas que le han sido asignadas para un día específico.
- **Acceso Restringido:** No tiene acceso a información financiera, de agencias, proveedores, ni a la creación de reservas.

**Ideal para:** Los guías que colaboran con la empresa y necesitan una forma de ver su agenda y gestionar su perfil.
