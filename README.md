# AI Student Support Navigator
> An AI-powered web application that helps newly arrived and multilingual students understand school systems through personalized, simplified guidance using Microsoft AI.

## Problem

Newly arrived and multilingual students often struggle to understand school rules, administrative processes, and available support services. 
Schools lack scalable tools to provide personalized, accessible guidance without increasing staff workload.

## Solution

AI Student Support Navigator is a web-based chat application that provides students with clear, age-appropriate, and multilingual explanations of school-related topics.

The system adapts each response to the student’s language proficiency and education level, ensuring inclusive and accessible support.

## Key Features (MVP)

- Chat-based interface for asking school-related questions
- Personalized responses based on student age and language preference
- Simplified, step-by-step explanations
- Multilingual support
- Built with Microsoft Azure AI services

## Microsoft AI Usage

This project is built around Microsoft AI services that are core to its functionality:

- **Azure AI Language**
  - Detects the student’s input language
  - Identifies the intent of the question (e.g. school rules, asking for help, activities)

- **Azure OpenAI**
  - Generates personalized, simplified explanations
  - Adapts language complexity to the student’s age and proficiency level

These services are essential to the application and enable scalable, inclusive student support.

## Architecture Overview

1. The student submits a question via the web chat interface
2. The backend sends the message to Azure AI Language for intent and language detection
3. The structured output is passed to Azure OpenAI
4. Azure OpenAI generates a simplified, personalized response
5. The response is returned and displayed in the chat interface

## Tech Stack

- **Frontend:** Next.js (React)
- **Backend:** Next.js API Routes
- **AI Services:** Azure AI Language, Azure OpenAI
- **Hosting:** Microsoft Azure

## Demo Scenarios

The MVP demonstrates the following scenarios:

- Understanding school rules
- Knowing who to ask for help at school
- Joining school activities or clubs

## Getting Started

1. Clone the repository
2. Install dependencies
3. Configure Azure environment variables
4. Run the development server

## Imagine Cup 2026

This project was developed as part of the Microsoft Imagine Cup 2026 competition and focuses on inclusive education through responsible use of AI.

## License

This project is provided for educational and demonstration purposes.

