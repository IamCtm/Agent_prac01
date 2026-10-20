import { GoogleGenAI, mcpToTool } from "@google/genai";
import 'dotenv/config'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const request = 'define weather what is the current weather in ife, Nigeria.?'
console.error(!!process.env.GEMINI_API_KEY)
//servers
const weather =  new StdioClientTransport({
    command: "node",
    args: ['./server01/weather_server.js']
});


//clients
const weather_client = new Client({
    name: 'weather',
    version: '1.0.0'
});

//Connectors
await weather_client.connect(weather)

//Servers Registry i.e server name connected to the client
const mcpServers = {
    get_weather: weather_client
}

//list available tools
const { tools } = await weather_client.listTools();
const weather_tools = tools.map( tool => {
    return {
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
    }
});

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});


const message_History = []


//first call to the LLM
//the kinds of errors that can happen here:
//1. Network Error(request didn't reach the LLM) - first lvl/response error, stops code execution and returns response to user immediately
//2. Bad Response/ Token Limit Hit (request reaches the LLM/LLM server but was not successful)
const controller = new AbortController()

const Llm_call = async (request) => {
    return await ai.interactions.create({
                model: 'gemini-3.8-flash',
                input: request,
                tools: weather_tools,
                // system_instruction: "you are a weather fetching agent, you forecast weather based on user's input.where user's request does not mach your role, reply with your role in a simple polite and helpful tone.anywhere the weather is requested, always make use of the tools provided.",
                generation_config: {
                    tool_choice: "auto",
                    thinking_level: "low",
                }
    },{
        // timeout_ms: 1000,
        fetchOptions: {
            signal: controller.signal
        }
    }
)
};
// message_History.push({
//     role: 'user',
//     content: request
// })

let first_response;
let function_calls;
let generated_texts;

const time_out = setTimeout(() => {
    if(!first_response?.steps) controller.abort()
}, 30000);

try{
    //network was established, but the request was unsuccessful
    first_response = await Llm_call(request)

    if(first_response?.steps && first_response.steps.length !== 0){
        message_History.push({
            role: 'model',
            content: first_response.steps
        })
        function_calls = first_response.steps.filter(functionCall => functionCall.type === 'function_call')
        generated_texts = first_response.steps.filter(gen_texts => gen_texts.type === 'text')
    }else {
        throw new Error('Error response')
    }




}catch(error) {
    if(error.name === 'APIconnectionError')console.error(`This is a connection Error: ${error.message}`)
    if(error.name === 'APIUserAbortError') console.log(`${error.message}`)
    if(error.statusCode || Number.isInteger(error.status)) console.log(`${error.body.error.code}: ${error.body.error.message}`)
    else{
        console.error(error)
    }
}finally{
    clearInterval(time_out)
}

const executeMcpTool = async (call) =>  {
    //checks if the server called exists in the server registry
    try {
        const client = mcpServers[call.name];
        if(!client) throw new Error(`Tool does not exist ${call}`);
        return await client.callTool({
            name: call.name,
            arguments: call.arguments
        })
    }catch(error) {
        console.error(` there was an error in executemcp block ${error.message}`)
        throw error
    }
    
}

const first_tool_results = await Promise.all (
    function_calls.map(async call => {   
        try{
            if(!call.name || Object.values(call.arguments).length === 0) throw new Error('Either of tool name or arguements are absent')
            const result = await executeMcpTool(call); 
            const formatted_result = result.content[0].text

            return {
                type: "function_result",
                name: "get_weather",
                call_id: call.id,
                result: formatted_result
            }
        }catch(error) {
            return {
                type: "function_result",
                name: "get_weather",
                call_id: call.id,
                result: error.message
            }
        }
    })
);

console.error(first_tool_results);
// console.error(function_calls);
// console.error(first_response)
console.error(first_response.steps);
// console.error(function_calls)
console.error('the first execution ends here');

// // console.error(first_tool_results[0].result.content);

let prev_res_id = first_response.id;
let tool_Result = first_tool_results;

const MAX_ROUND = 10
let i;

for(i = 0; i < MAX_ROUND; i++) {
    const subsequent_response = await ai.interactions.create({
        model: 'gemini-3.8-flash',
        input: tool_Result,
        tools: weather_tools,
        previous_interaction_id: prev_res_id,
        // system_instruction: "you are a weather fetching agent, you forecast weather based on user's input.where user's request does not mach your role, reply with your role in a simple polite and helpful tone.anywhere the weather is requested, always make use of the tools provided.",
        generation_config: {
            tool_choice: "auto",
            thinking_level: "low",
        }

    })

    const subsequent_function_calls = subsequent_response.steps.filter(call => call.type === 'function_call')

    if(subsequent_function_calls.length === 0) {
        console.log(subsequent_response)
        break;
    }else {
        tool_Result = await Promise.all(
            subsequent_function_calls.map( async call => {
                try{
                    if(!call.name || Object.values(call.arguments).length === 0) throw new Error('Either of tool name or arguements are absent')
                    const result = await executeMcpTool(call); 
                    const formatted_result = result.content[0].text

                    return {
                        type: "function_result",
                        name: "get_weather",
                        call_id: call.id,
                        result: formatted_result
                    }
                }catch(error) {
                    return {
                        type: "function_result",
                        name: "get_weather",
                        call_id: call.id,
                        result: error.message
                    }
                }
            })
        );
    };
    prev_res_id = subsequent_response.id;
    console.log(`no of executions: ${i + 1}`)
}