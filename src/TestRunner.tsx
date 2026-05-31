import {Stage} from "./Stage";
import {useEffect, useState} from "react";
import {DEFAULT_INITIAL, DEFAULT_MESSAGE, StageBase, InitialData} from "@chub-ai/stages-ts";

// Modify this JSON to include whatever character/user information you want to test.
import InitData from './assets/test-init.json';

export interface TestStageRunnerProps<StageType extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType>, InitStateType, ChatStateType, MessageStateType, ConfigType> {
    factory: (data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) => StageType;
}

/***
 This is a testing class for running a stage locally when testing,
    outside the context of an active chat. See runTests() below for the main idea.
 ***/
export const TestStageRunner = <StageType extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType>,
    InitStateType, ChatStateType, MessageStateType, ConfigType>({ factory }: TestStageRunnerProps<StageType, InitStateType, ChatStateType, MessageStateType, ConfigType>) => {

    // You may need to add a @ts-ignore here,
    //     as the linter doesn't always like the idea of reading types arbitrarily from files
    // @ts-ignore
    const [stage, _setStage] = useState(new Stage({...DEFAULT_INITIAL, ...InitData}));

    // This is what forces the stage node to re-render.
    const [node, setNode] = useState(new Date());

    function refresh() {
        setNode(new Date());
    }

    async function delayedTest(test: any, delaySeconds: number) {
        await new Promise(f => setTimeout(f, delaySeconds * 1000));
        return test();
    }

    /***
     This is the main thing you'll want to modify.
     ***/
    async function runTests() {
        await stage.setState({location: "Solmeryn Kingdom - The Lamplighter's Nest - Hidden Chamber", timeOfDay: "Afternoon", clock: "13:12", you: "Unknown - Human (Regular clothing; Standing; hands visible)", npc: "None", thread: "None", wallet: "0G ; 0S ; 0C", walletInitialized: false, npcMemory: {}, pendingNpcDebugQuery: null, pendingNpcMemoryCommand: null});
        refresh();

        const beforePromptResponse = await stage.beforePrompt({
            ...DEFAULT_MESSAGE, ...{
                anonymizedId: "0",
                content: "Hello, I'm looking around the hidden chamber.",
                isBot: false
            }
        });
        console.assert(beforePromptResponse.error == null);
        refresh();

        const afterPromptResponse = await stage.afterResponse({
            ...DEFAULT_MESSAGE, ...{
            promptForId: null,
            anonymizedId: "2",
            content: `**Solmeryn Kingdom - The Lamplighter's Nest - Hidden Chamber | Afternoon | 13:12**
**You: Male - Human (Regular clothing; Standing; hands visible)**
**NPC: None**
**Thread: None**
**Wallet: 0G ; 0S ; 0C**
***

*The hidden chamber is dimly lit, with old tomes lining the walls.*`,
            isBot: true}});
        console.assert(afterPromptResponse.error == null);
        refresh();

        const secondPrompt = await stage.beforePrompt({
            ...DEFAULT_MESSAGE, ...{
            anonymizedId: "0", content: "I examine the books on the shelf.", isBot: false, promptForId: null
        }});
        console.assert(secondPrompt.error == null);
        refresh();
    }

    useEffect(() => {
        // Always do this first, and put any other calls inside the load response.
        stage.load().then((res) => {
            console.info(`Test StageBase Runner load success result was ${res.success}`);
            if(!res.success || res.error != null) {
                console.error(`Error from stage during load, error: ${res.error}`);
            } else {
                runTests().then(() => console.info("Done running tests."));
            }
        });
    }, []);

    return <>
        <div style={{display: 'none'}}>{String(node)}{window.location.href}</div>
        {stage == null ? <div>Stage loading...</div> : stage.render()}
    </>;
}
