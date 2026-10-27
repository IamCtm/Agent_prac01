import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

//establishes connection between server and client via standard input, output.

const server = new McpServer({
    name: 'weather_server',
    version: '1.0.0'
});

server.registerTool(
    'get_weather', 
    {
        type: 'function_calling',
        title: 'get_weather', //LLM reads this and it turns to name properties in its response.
        description: 'gets the weather of location pecified in the prompt',
        inputSchema: z.object({ //defines what schema the LLM Produces for function calling
            longitude: z.number(),
            latitude: z.number()
        })
    },
    async ({longitude, latitude}) => {
        try {
            const response = await fetch(`https://my.meteoblue.com/packages/basic-1h_basic-day?apikey=BuCWrgHeP8tQq4si&lat=${latitude}&lon=${longitude}&asl=11&format=json`)
            if(!response.ok) {
                throw new Error(`HTTP error ${response.status}`)
            }
            const results = await response.json()
            const weather_parameters = results.data_1h
            const weather_units = results.units

            const new_time_list = weather_parameters.time.slice(0, 15)
            const fmt = (value, unit) => {
                return (value && unit? `${value} ${unit}`: 'not provided')
            }

            const modified_result= new_time_list.map( (time, i) => {
                return ({
                    time: `${time} ${results.metadata.timezone_abbrevation}`,
                    temperature: fmt(weather_parameters.temperature[20],weather_units.temperature),
                    precipitation_probability: fmt(weather_parameters.precipitation_probability[i], weather_units.precipitation_probability),
                    windspeed: fmt(weather_parameters.windspeed[i], weather_units.windspeed),
                    convective_precipitation: fmt(weather_parameters.convective_precipitation[i], weather_units.precipitation)
                })
            })

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(modified_result)
                    }
                ],
                isError: false
            }

        } catch (error) {
            console.error("this error was triggered")
            return {
                content: [
                    {
                        type: 'text',
                        text: `error retrieving weather forecast ${error.message}`
                    }
                ],
                isError: true
            }
        }
    }
)
const transport = new StdioServerTransport();

await server.connect(transport);

