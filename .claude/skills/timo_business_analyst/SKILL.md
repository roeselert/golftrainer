
## name: Business Analyst Skill
description: This guide provides a standardized approach for Business Analysts to write clear, high-quality Use Cases and Acceptance Criteria


## The Use Case Template

1. Use Case Overview

• Use Case Name:
• Actor:
• Stakeholders & Interests:
• Goal:
• Scope:
• Preconditions:
---

2. Trigger

• What event starts this use case?


---

3. Main Success Scenario (Basic Flow)

*   `flow name(params) { ... }`: Indentation-based, sequential pseudo-code describing the exact logic path.
*   `transaction { ... }`: Explicit wrapper within a flow ensuring all inner operations are atomic (all-or-nothing database transactions).

---

4. Alternative Flows

*   `flow name(params) { ... }`: Indentation-based, sequential pseudo-code describing the exact logic path.
*   `transaction { ... }`: Explicit wrapper within a flow ensuring all inner operations are atomic (all-or-nothing database transactions).

---

5. Exception Flows

• Exception 1:• Error condition:
• System response:

*   `flow name(params) { ... }`: Indentation-based, sequential pseudo-code describing the exact logic path.
*   `transaction { ... }`: Explicit wrapper within a flow ensuring all inner operations are atomic (all-or-nothing database transactions).

---

6. Business Rules

• Rule 1
• Rule 2


---

7. Data Requirements

*   `entity Name { ... }`: Defines raw core domain models.


## Acceptance Criteria (Given-When-Then)

Acceptance criteria define the boundaries of a user story. They use the Behavior-Driven Development (BDD) framework to describe how the system should react from the user's perspective.

*   **Given:** The initial context, setup, or pre-condition.
*   **When:** The specific action or event triggered by the user.
*   **Then:** The expected outcome, result, or system reaction.

## Grammar & Syntax rules

DSL to specify processes and data 
Do not use boilerplate keywords (`export`, `class`, `function`), async annotations (`Promise`, `await`), or unnecessary curly braces in flows.

*   `entity Name { ... }`: Defines raw core domain models.
*   `flow name(params) { ... }`: Indentation-based, sequential pseudo-code describing the exact logic path.
*   `transaction { ... }`: Explicit wrapper within a flow ensuring all inner operations are atomic (all-or-nothing database transactions).

---

## 💡 Practical Examples


### Example: Form Validation

*   **Scenario 1: Missing required field**
    *   **Given:** The user leaves the "Last Name" field empty.
    *   **When:** The user clicks the "Register" button.
    *   **Then:** The system highlights the field in red and displays the message "Last Name is required".

```typescript
  entity Order {
    id: string
    total: number
    status: "PENDING" | "PAID"
  }

 
  flow execute(orderId: string, amount: number) {
    transaction {
        isPaid = payment.charge(amount)
        if not isPaid
          fail "Payment failed"

        db.updateStatus(orderId, "PAID")
     }
   }
 
 
```


---

## 🛠️ Best Practices for Business Analysts

*   **Apply INVEST:** Ensure your stories are Independent, Negotiable, Valuable, Estimable, Small, and Testable.
*   **Define Specific Roles:** Use detailed personas like "Premium Subscriber" or "System Administrator" instead of a generic "User".
*   **Focus on Business Value:** Avoid technical implementation details (e.g., write "The system saves the preferences" instead of "Insert data into PostgreSQL").
*   **Include Negative Scenarios:** Always write acceptance criteria for edge cases and error states, not just the happy path.
kk