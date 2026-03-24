---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, use the #tool:vscode/askQuestions tool and include your recommended answers.

- If a question can be answered by exploring the codebase, explore the codebase instead.
- If a question can be answered by exploring online resources, use the #tool:agent/runSubagent tool with the deep-research skill instead.

---

When you are absolutely sure we have reached a shared understanding, confirm with me and ask what the next step is. Use the #tool:vscode/askQuestions tool to present the options:

- "Start implementation" — you will proceed to implement the plan as is, without further questioning
- "Create a PRD" — you will proceed to create a PRD by following the write-a-prd skill, using the plan as source material

Do NOT proceed until I explicitly tell you to.
