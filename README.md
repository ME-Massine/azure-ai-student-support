# AI Student Support Navigator

> An AI-powered web application that helps newly arrived and multilingual students understand school systems through personalized, simplified guidance using Microsoft AI.

---

## Problem

Newly arrived and multilingual students often struggle to understand school rules, administrative procedures, and available support services.  
School information is usually complex, text-heavy, and not adapted to students with limited language proficiency.

At the same time, teachers and counselors lack scalable tools to provide personalized explanations to every student without increasing their workload.

---

## Solution

AI Student Support Navigator is a web-based chat application that provides clear, age-appropriate, and multilingual explanations of school-related topics.

The application adapts each response to the student’s language proficiency and education level, making school information more accessible, inclusive, and easier to understand.

---

## Key Features (MVP)

- Chat-based interface for asking school-related questions
- Personalized responses based on student age range and preferred language
- Simplified, step-by-step explanations using clear vocabulary
- Multilingual support for diverse student populations
- Built around Microsoft Azure AI services

---

## Microsoft AI Usage

This project relies on Microsoft AI services that are core to its functionality:

- **Azure AI Language**
  - Detects the language of the student’s input
  - Identifies the intent of the question, such as school rules, asking for help, or joining activities

- **Azure OpenAI**
  - Generates personalized and simplified explanations
  - Adapts the complexity of responses to the student’s age and language proficiency
  - Produces supportive, inclusive guidance in a conversational format

Without these Microsoft AI services, the application would not be able to deliver scalable, adaptive student support.

---

## Microsoft AI Services Used

Azure OpenAI generates age-appropriate, scoped guidance; Azure AI Language detects the language and intent of each message; and Azure AI Content Safety moderates student and AI messages before publication.

---

## Architecture Overview

1. The student submits a question through the web-based chat interface  
2. The backend sends the message to Azure AI Language to detect intent and language  
3. The structured output is passed to Azure OpenAI  
4. Azure OpenAI generates a simplified, personalized response  
5. The response is returned and displayed in the chat interface  

This architecture enables real-time, inclusive support using Microsoft AI.

---

## Demo Scenarios

The MVP demonstrates the following realistic school scenarios:

- Understanding school rules and expectations
- Knowing who to ask for help when feeling lost in class
- Learning how to join school activities or clubs

---

## Tech Stack

- **Frontend:** Next.js (React)
- **Backend:** Next.js API Routes
- **AI Services:** Azure AI Language, Azure OpenAI
- **Hosting:** Microsoft Azure

---

## General Student Chat (ACS + Cosmos metadata)

The project now includes a general student chat channel that mirrors an Azure-first architecture:

- **Transport:** Azure Communication Services (ACS) is the delivery layer for real-time chat.
- **Governance & Storage:** Cosmos DB-style persistence tracks chat metadata, AI verifications, moderation flags, and official rule references.
- **AI Policy Enforcement:** Azure OpenAI runs on-demand verification against school rules; AI replies are posted as new messages and never edit student content.

### Data models

- `User` links `userId` to the ACS identity and school context.
- `ChatThread` holds the single school-wide thread for the MVP.
- `ChatMessage` keeps immutable human messages plus AI/system events, with verification status.
- `AIVerification`, `ModerationFlag`, and `OfficialRule` back governance and traceability.

### API routes

- `POST /api/chat/thread` – create or fetch the school-wide thread and return its metadata.
- `POST /api/chat/send` – deliver a message through ACS and persist chat metadata.
- `POST /api/chat/verify` – run Azure OpenAI verification, store the record, and post the AI verdict as its own message.
- `POST /api/chat/moderate` – apply content safety checks, persist moderation flags, and optionally post a system warning.

---

## Imagine Cup 2026

This project was developed as part of the Microsoft Imagine Cup 2026 competition.  
It focuses on inclusive education and responsible use of AI to support students and schools.

---

## License

This project is provided for educational and demonstration purposes.
