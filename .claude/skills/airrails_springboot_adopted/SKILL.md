# Spring Boot Server Skill
Architecture and coding rules for long‑running **Spring Boot** server applications — BCE layering, business components (BC), Spring MVC controllers, Spring DI, Spring Data JPA, JSON serialization, testing (unit/integration/system), and Maven project structure. Use when creating, generating, scaffolding, writing, or reviewing code, resources, entities, boundaries, or business components in Spring Boot server projects. Not for serverless deployments.

---

## Composition
- compose with `java-conventions` for all language-level Java rules
- this skill specializes only the Spring Boot server context — it does not restate language-level rules

---

## Dependencies
- prefer dependencies in this order: **Java SE**, **Spring Boot**, **Spring Framework**, **Spring Data**, **Spring Web**

---

## Exceptions (Spring MVC)
- custom exceptions extend `RuntimeException` and are mapped via `@ResponseStatus` or `@ControllerAdvice`
- use explicit exceptions like `ResponseStatusException(HttpStatus.BAD_REQUEST)`
- prefer throwing explicit exception types rather than manually constructing `ResponseEntity` everywhere

---

## BCE/ECB Architecture
- structure code using the BCE architecture
- package structure: `[ORGANIZATION_NAME].[PROJECT_NAME].[COMPONENT_NAME].[boundary|control|entity]`
- top-level package reflects the application responsibility or name
- rename the top-level `[PROJECT_NAME]` package if needed
- business components are children of the top-level package
- BCs may represent domain concepts or shared concerns
- boundary, control, entity packages exist only inside BCs
- BCs may consist only of a control layer when procedural
- not every BC needs a boundary package
- prefer a dedicated BC over the root package when a shared concern has domain semantics
- root package is reserved for trivial plumbing
- do not explain BCE pattern in documentation

---

## Boundary Layer (Spring MVC)
- keep coarse-grained classes in the boundary package
- place facades and REST controllers in the boundary package
- health checks belong in the boundary package
- `@Transactional` is only allowed in the boundary layer
- if no boundary stereotype exists, use `@Component` or `@Service`

---

## Control Layer
- implement procedural business logic in the control package
- annotate control classes with `@Service`

---

## Entity Layer
- maintain domain objects, data classes, and JPA entities in the entity package
- entities maintain state and behavior
- model value objects as enums
- direct references between entities from independent BCs are allowed but minimized
- database relations must be reflected in entities (`@ManyToOne`, `@OneToMany`, or ID fields)
- excessive cross-BC references indicate a need for refactoring

---

## Components
- create new components with minimal business logic and essential fields only

---

## JavaDoc (Spring Boot)
- link to external specifications (Spring Framework, Spring Boot, JPA)
- use popular technical terms from Java SE and Spring ecosystem in unit tests and javadoc

---

## README Guidelines
- write brief, precise README.md files for advanced developers
- avoid generic adjectives like “simple” or “lightweight”
- do not include detailed project structure listings
- never list REST controllers in READMEs
- if modules are listed, provide links
- avoid the term “Orchestrates”

---

## Integration Tests
- integration tests end with **IT** suffix and run via the failsafe plugin
- use `@SpringBootTest` with real application context
- prefer `TestRestTemplate` or `WebTestClient` for HTTP-level tests

---

## System Tests (ST)
- system tests live in a dedicated Maven module ending with **“-st”**
- use Spring WebClient or TestRestTemplate for testing REST endpoints
- client interfaces: `src/main/java` of the -st module
- test classes: `src/test/java` of the -st module
- name client interfaces after the controller with “Client” suffix
- STs end with **IT** suffix
- do not use RestAssured
- execute system tests after major changes
- skip system tests in PoC mode

---

## Spring MVC (REST)
- controllers should be named in plural (e.g., `SpeakersController`)
- declare `@RequestMapping(produces=..., consumes=...)` at class level
- do not implement business logic in controllers; delegate to control layer
- prefer returning `ResponseEntity<?>`
- reuse existing WebClient beans; do not create new ones unnecessarily

---

## JSON Serialization
- prefer Jackson (Spring Boot default)
- record entities should ship with `toJson()` returning a Jackson `ObjectNode`
- map JSON to entities in the boundary layer
- create record entities from JSON using static factory methods: `fromJson(ObjectNode json)`

---

## Project Management
- always ask before changing `pom.xml`
- load `AGENTS.md` (if present) before making changes
- do not create or change files on opening existing projects
- do not generate code initially in an empty project
- Maven pom.xml must not be created for Java 25 CLI applications
- rely on Spring Boot’s validation starter instead of Hibernate Validator directly
- create metrics and observability features using **OpenTelemetry**
