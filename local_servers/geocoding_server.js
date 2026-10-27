import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

//create the instance of a new server
const server = new McpServer({
    name: 'geocoding_server',
    version: '1.0.0'
})

//just creating custom error

class EmptyLocationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EmptyLocationError';
    }
}
//since the server has been created, we proceed to register the tool we want on the server to the MCP server
server.registerTool(
    'get_coordinates',
    {
        type: 'function',
        title: 'get_coordinates',
        description: 'Accepts a city name or postal codes and returns its latitude and longitude.',
        inputSchema: z.object({
            city: z.any().describe('this recieves both location Name and Postal, depends on what the user presents')
        }),
        outputSchema: z.object({
            longitude: z.number().describe('longitude of the location'),
            latitude: z.number().describe('latitude of the location')
        }),
        
    },
    async ({city}) => {
        const params = new URLSearchParams({
            name: city,
            count: 3,
            language: 'en',
            format: 'json'
        })

        if(!city) throw new EmptyLocationError('No location was provided')
        try{
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`)

            if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`)

            const result = await response.json()
            const geocode = result.results[0]

            const modified_result = {
                longitude: geocode.longitude,
                latitude: geocode.latitude
            }


            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(modified_result)
                    }
                ],
                structuredContent: modified_result
            }

        }catch(error) {
            if(error.name === 'APIConnectionError') console.error(`error connecting with Meteo server: ${error.message}`)
            // if(error.error || Number.isInteger(error.statusCode)) console.log(`${error.statusCode}: ${error.reason}`)
            if(error.name === 'EmptyLocationError') console.error(`Location undefined: ${error.message}`)
            throw error
        }
    }
)



const transport  = new StdioServerTransport()
await server.connect(transport)