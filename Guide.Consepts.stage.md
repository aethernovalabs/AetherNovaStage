ini adalah data asli dari platform chub ai jangan mengubah ini, dan jadikan ini sebagai refensi


# Concepts

## Project Structure

A stage is, at its core, a React website, just a very small one.&#x20;

<pre><code>public/
    chub_meta.yaml  # Information like the stage's name.
src/
<strong>    Stage.tsx  # The core stage implementation.
</strong>                       # This is the main file to edit.
    TestRunner.tsx     # A runner for testing.
    assets/
        test-init.json    # Testing data for the Test Runner.
    index.scss         # CSS styling
    main.tsx           # The app's entry point.
    App.tsx
package.json        # Dependency management
.github/            # A utility file that creates the stage
    workflows/      # project in Chub, and builds and deploys it
        deploy.yml  # on push.
.eslintrc.cjs       # Linter configuration file
index.html          # The root HTML
tsconfig.json       # TypeScript configuration file
tsconfig.node.json  # TypeScript configuration file
vite.config.ts      # Vite configuration file
yarn.lock           # Freezes dependencies
</code></pre>

Communication between the chat UI itself and the stage site is handled by the stages library -- to develop you only need to be concerned with implementing the StageBase interface.&#x20;

## Where a Stage Exists in a Chat

If a stage is given a position of 'NONE' in the chub-meta.yaml, it doesn't display at all, instead running in the background. Otherwise, on a desktop or wide screen, it displays to the right of a chat, with the majority of the height of the window minus some padding.

<figure><img src="/files/K54BjpF17Xpw3nUHKdMy" alt="" width="375"><figcaption><p>The stage's place highlighted with the browser's inspector.</p></figcaption></figure>

On mobile devices or narrow windows, the stage is given a smaller space between the chat header and messages, with the messages fading out in the background.

<figure><img src="/files/rSHN2rKSLXcUSO8b0MSh" alt="" width="124"><figcaption><p>Narrow-screen/mobile view.</p></figcaption></figure>

If there are multiple visible stages, they will share the space, with equal-height rows on wide screens and equal-width columns on narrow screens.

If your stage outputs system messages, they will display at the end of whatever message they were given in response to. System messages are visible to the human only, and not sent to the LLM.

<figure><img src="/files/xKDdRCP6EloshXZXVnI4" alt=""><figcaption><p>A stage that outputs system messages. The 'Available Directions' and lists that appear at the end of The Maze's messages are in fact from a stage attached to it. System messages are stored separately from language model responses and user messages, so that the language model doesn't get confused and try to generate stats blocks itself. Here, the stage can correctly show the available directions from a maze it has generated, the sort of geometric logic that a language model might have trouble with.</p></figcaption></figure>

## Stage Lifecycle and Communication

### Top-Down Communication Points

There are four places where a stage is called: initialization, before a message is sent to an LLM, after a response is received from an LLM, and when the user swipes or jumps from one place in the chat tree to another. The interface template file is heavily commented with explanations of each case.

#### Initialization

This corresponds to the 'constructor' and 'load' functions in the stage interface. When a chat is started, an initialization function is called in your stage with information about the chat and its participants. The stage has the opportunity to return some initialization-specific state information -- for a more detailed explanation of state types, see [State](/docs/stages/developing-a-stage/state.md).

#### Before a Prompt

This corresponds to the 'beforePrompt' function in the stage interface. When a user initiates a call to an LLM, the stage is first sent information on the prompt being sent, and has the chance to modify the user's message, save the stage's updated internal state, append something to the prompt, and attach a system message to the user's message.

#### After a Response

This corresponds to the 'afterResponse' function in the stage interface. When a response is fully received from the LLM, the stage has an opportunity to modify the response message, save the stage's updated internal state, and attach a system message to the bot's message.

#### On a Swipe or Jump

This corresponds to the 'setState' function in the stage interface. On a swipe or jump to a message that has already been seen previously, the stage is sent what its message-level state for that message was.  For example, in a stage that shows a character's expression pack, the message-level state has each character's current emotion. Note how this is only one of the three types of state -- see [State](/docs/stages/developing-a-stage/state.md) for more information.

#### Rendering

The 'render' function may be called at any time, and returns a ReactElement component. It's what your stage will look like. Try to avoid doing significant work inside this function.

### Bottom-Up Communication Points (Experimental/Unstable)

Additionally, there are functions a stage may call at any time. They are contained in the 'generator' member of your stage class, i.e. it can be called with `this.generator.someFunction()`. Its interface is here: <https://github.com/CharHubAI/chub-extensions-ts/blob/main/src/types/generation/service.ts>. Note: of these, only {'makeImage', 'imageToImage', 'removeBackground', 'inpaintImage'} are implemented, and none of them are stable. For this reason, `await`ing on any of them within any of the top-down communication points is not wise at this time. Best results are always with the 1:1 aspect ratio. Since these are ad-hoc generations meant to come back in a few seconds, there is a quality tradeoff. A proper imagegen and \*gen UI with tradeoffs balanced towards higher quality is under development.


---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.chub.ai/docs/stages/developing-a-stage/concepts.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.