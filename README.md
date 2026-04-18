> Why do I have a folder named ".expo" in my project?

The ".expo" folder is created when an Expo project is started using "expo start" command.

> What do the files contain?

- "devices.json": contains information about devices that have recently opened this project. This is used to populate the "Development sessions" list in your development builds.
- "settings.json": contains the server configuration that is used to serve the application manifest.

> Should I commit the ".expo" folder?

No, you should not share the ".expo" folder. It does not contain any information that is relevant for other developers working on the project, it is specific to your machine.
Upon project creation, the ".expo" folder is already added to your ".gitignore" file.

## Firestore structure notes (current implementation)

- `users/{uid}`
  - Patient profile fields: `fullName`, `age`, `phone`, `email`, `relativeProfile`
  - Doctor profile fields: `fullName`, `specialty`, `experience`, `location`, `averageRating`, `status`
  - Admin role fields: `role`, `isAdmin`, `adminRole` (`super_admin` supported)

- `reservations/{reservationId}`
  - Appointment status timeline fields (`pending`, `confirmed`, `completed`, etc.)
  - Booking context fields: `bookingFor`, `bookedForName`, `bookedForRelation`, `bookedForAge`

- `ratings/{ratingId}`
  - Rating metrics + optional comment
  - Eligibility-linked fields: `appointmentId`, `isPublicComment`

- `suggestions/{suggestionId}`
  - User feedback entry for suggestion box (`text`, `status`, `createdAt`)

- `admin_approval_requests/{requestId}`
  - Approval queue for limited admins (`type`, `payload`, `status`, `requestedBy`)

- `doctor_earnings/{doctorId}`
  - Placeholder earnings tracking (`totalCompletedAppointments`, `updatedAt`)

- `payment_transactions/{transactionId}`
  - Transfer-ready payment records
  - Current placeholder payment method: `el_dahabya_placeholder`

- `payment_config/el_dahabya`
  - Bank integration placeholder document with reserved integration points.
