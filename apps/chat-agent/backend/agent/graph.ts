import {
    StateGraph,
    StateSchema,
    START,
    END,
    MessagesValue
} from "@langchain/langgraph";
import { simpleAgent } from './agent';

const State = new StateSchema({
    messages: MessagesValue,
});

export const graph = new StateGraph(State)
    .addNode('chat_agent', simpleAgent.graph)
    .addEdge(START, 'chat_agent')
    .addEdge('chat_agent', END)
    .compile();
