/**
 * CARMEN Video SDK
 *
 * @category    CSharp Sample
 * @package     CARMEN Video CSharp Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * uses the custom source / image stream feature.
 * This example implements a custom source that reads images from a directory.
 */


using Carmen;
using Carmen.Anpr;
using Carmen.Video;
using CustomStream;

class Sample06_custom_stream
{
    static void EventHandlerCallback(Event e)
    {
        try
        {
            using (e)
            {
                Console.WriteLine("------------------------------------------------------");
                Console.WriteLine("Plate text: " + e.Vehicle.Plate.Text);
                Console.WriteLine("Country: " + e.Vehicle.Plate.Country);

                Console.WriteLine();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Exception in event callback. " + ex);
        }
    }

    static void Main(string[] args)
    {
        try
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Usage: <program name> <region code> <image dir path>");

                //  Region code:
                //      See in Reference Manual: Region List
                
                Console.ReadKey();
                return;
            }

            String region = args[0];
            String imageDir = args[1];

            using Anpr.AnprBuilder anprBuilder = Anpr.Builder();
            using Anpr anpr = anprBuilder
                .Type(AnprType.Local) // use LocalGo for CARMEN_GO engines
                .Build();

            using StreamProcessor.StreamProcessorBuilder streamProcessorBuilder = StreamProcessor.Builder();
            using StreamProcessor stream = streamProcessorBuilder
                .Source(new MyStreamFactory(imageDir))
                .Region(region)
                .Name("Stream 1")
                .EventCallback(EventHandlerCallback)
                .StatusChangeCallback(Utils.CommonStatusCallback) // may be omitted, the example only uses it for showing status changes
                .Anpr(anpr)
                .Build();
            
            Console.WriteLine("Please press 'q' then 'Enter' to stop stream processing.");
            
            stream.Start();
            
            while (Console.ReadLine() != "q");
            
            stream.Stop();
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
        }

        Console.WriteLine("Please press a key to exit the program.");
        Console.ReadKey();
    }
}
