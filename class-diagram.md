# GameHub — Class Diagram

> **Chú giải quyền truy cập (Access Legend)**
> - 🔓 `public` — Không cần đăng nhập
> - 🔑 `auth` — Yêu cầu đăng nhập (requireAuth)
> - 🛡️ `mod/admin` — Yêu cầu quyền Mod hoặc Admin (requireModOrAdmin)
> - 👑 `admin` — Chỉ Admin (requireAdmin)

```mermaid
classDiagram
    direction TB

    class User {
        -ObjectId _id
        -String username
        -String email
        -String password
        -String googleId
        -String authProvider
        -String avatar
        -String role
        -Boolean isAdmin
        -Date deletedAt
        -ObjectId deletedBy
        -String vipTier
        -Date vipExpiresAt
        -String stripeCustomerId
        -Array~String~ favorites
        -Date createdAt
        +comparePassword(candidatePassword) Boolean
        +register(username, email, password)$ void 🔓
        +login(identifier, password)$ void 🔓
        +googleSignIn(idToken)$ void 🔓
        +verifyGoogleFirstLogin(token, code)$ void 🔓
        +forgotPasswordStart(identifier)$ void 🔓
        +forgotPasswordVerifyOtp(resetToken, code)$ void 🔓
        +forgotPasswordResendCode(resetToken)$ void 🔓
        +forgotPasswordReset(resetToken, newPassword)$ void 🔓
        +getMe() User 🔑
        +updateProfile(username, avatar) void 🔑
        +uploadAvatar(imageData) void 🔑
        +updateFavorites(gameId) void 🔑
        +getAll()$ Array~User~ 🛡️
        +updateRole(userId, role)$ void 👑
        +updateVip(userId, action, days)$ void 👑
        +softDelete(userId)$ void 🛡️
        +restore(userId)$ void 🛡️
    }

    class Game {
        -ObjectId _id
        -String title
        -String description
        -String imageUrl
        -String url
        -String path
        -String category
        -Array~String~ tags
        -Number rating
        -String difficulty
        -String publisher
        -String version
        -String players
        -String controls
        -Number playCount
        -Number likeCount
        -Boolean vipOnly
        -Boolean isCustom
        -ObjectId addedBy
        -Date deletedAt
        -ObjectId deletedBy
        -String color
        -Date createdAt
        +getAll()$ Array~Game~ 🔓
        +getById(id)$ Game 🔓
        +getExclusive()$ Array~Game~ 🔓
        +incrementPlayCount(id)$ void 🔓
        +syncAverageRating(gameId) void
        +create(payload)$ Game 🛡️
        +update(id, payload)$ Game 🛡️
        +softDelete(id)$ void 🛡️
        +restore(id)$ void 🛡️
        +getAllAdmin(includeDeleted)$ Array~Game~ 🛡️
    }

    class Review {
        -ObjectId _id
        -ObjectId game
        -ObjectId user
        -Number rating
        -String comment
        -Date createdAt
        -Date updatedAt
        +getByGame(gameId, page, sort)$ Array~Review~ 🔓
        +getByUser(userId, sort, rating, search)$ Array~Review~ 🔓
        +getSummary(gameId)$ Object 🔓
        +createOrUpdate(game, rating, comment) Review 🔑
        +delete(id) void 🔑
    }

    class GameComment {
        -ObjectId _id
        -ObjectId game
        -ObjectId user
        -ObjectId parentComment
        -String content
        -Array~ObjectId~ likes
        -Boolean isEdited
        -Date createdAt
        -Date updatedAt
        +getByGame(gameId, page, sort)$ Array~GameComment~ 🔓
        +create(game, content, parentComment) GameComment 🔑
        +edit(id, content) void 🔑
        +delete(id) void 🔑
        +toggleLike(id) void 🔑
    }

    class Score {
        -ObjectId _id
        -ObjectId user
        -String gameId
        -Number score
        -String activityType
        -String result
        -Number durationSeconds
        -Mixed metadata
        -Date date
        +getLeaderboard(gameId)$ Array~Score~ 🔓
        +submit(gameId, score, activityType, result) Score 🔑
        +getUserHistory(limit) Array~Score~ 🔑
        +getUserSummary() Object 🔑
    }

    class Payment {
        -ObjectId _id
        -ObjectId userId
        -String planId
        -String planTitle
        -Number amount
        -String currency
        -Number days
        -String status
        -String paymentMethod
        -String stripeCustomerId
        -String stripeSessionId
        -String stripePaymentIntentId
        -String stripeInvoiceId
        -String transactionId
        -String externalTransactionId
        -Date paidAt
        -Date completedAt
        -Boolean notifySent
        -Boolean adminNotified
        -String notes
        -Mixed metadata
        -Date createdAt
        -Date updatedAt
        +getPlans()$ Array~Object~ 🔓
        +purchase(planId) void 🔑
        +initiate(planId, paymentMethod) Payment 🔑
        +verify(transactionId, approve) void 🔑
        +stripeCreateCheckout(planId) Object 🔑
        +stripeGetSession(sessionId) Object 🔑
        +stripeVerify(sessionId) void 🔑
        +getByUser() Array~Payment~ 🔑
        +getAllAdmin(status, page)$ Array~Payment~ 👑
        +getStats()$ Object 👑
        +markNotified(id)$ void 👑
    }

    class SupportTicket {
        -ObjectId _id
        -ObjectId user
        -String subject
        -String category
        -String status
        -ObjectId assignedTo
        -String gameId
        -Array~SupportMessage~ messages
        -Date lastMessageAt
        -Date createdAt
        -Date updatedAt
        +create(subject, category, message) SupportTicket 🔑
        +getAll(status) Array~SupportTicket~ 🔑
        +getById(id) SupportTicket 🔑
        +addMessage(id, content) void 🔑
        +updateStatus(id, status) void 🛡️
    }

    class SupportMessage {
        -ObjectId _id
        -ObjectId sender
        -String senderRole
        -String content
        -Date createdAt
    }

    class AuditLog {
        -ObjectId _id
        -ObjectId actor
        -String actorRole
        -String action
        -String targetType
        -ObjectId targetId
        -String targetLabel
        -Mixed details
        -String ip
        -String userAgent
        -Date createdAt
        +getAll(limit)$ Array~AuditLog~ 👑
    }

    User "1" --> "0..*" Payment : userId
    User "1" --> "0..*" Score : user
    User "1" --> "0..*" Review : user
    User "1" --> "0..*" GameComment : user
    User "1" --> "0..*" SupportTicket : user
    User "1" --> "0..*" Game : addedBy
    User "1" --> "0..*" AuditLog : actor
    User "0..1" ..> "0..*" SupportTicket : assignedTo
    User "1" --> "0..*" SupportMessage : sender

    Game "1" --> "0..*" Review : game
    Game "1" --> "0..*" GameComment : game
    Game "1" --> "0..*" Score : gameId

    SupportTicket "1" *-- "0..*" SupportMessage : messages

    GameComment "0..1" --> "0..*" GameComment : parentComment
```
