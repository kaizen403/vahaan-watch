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
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on multiple video streams.
 * There are "TODO" comments in the file where the code must be modified.
 */

using Carmen;
using Carmen.Anpr;
using Carmen.Mmr;
using Carmen.Video;

class Sample04_multi_stream
{
    public struct StreamConfig
    {
        public StreamConfig(string url, string region, string name)
        {
            Url = url;
            Region = region;
            Name = name;
        }

        public string Url { get; }
        public string Region { get; }
        public string Name { get; }
    }

//TODO: change them for valid streams and engines
    public static readonly List<StreamConfig> streamConfigs = new List<StreamConfig>
    {
        new StreamConfig("http://192.168.6.50:9901/video.mjpeg", "EUR", "Stream 1"),
        new StreamConfig("file:C:/Program Files/videos/video.mp4", "NAM", "Stream 2")
    };

//TODO: EventCallback is called from a StreamProcessor instance's dedicated "EventCallback executor" thread.
// If you are using the same resource in multiple StreamProcessors' EventCallback
// you may have to protect against race conditions

    static readonly object __lockEventCallback = new object ();

    static void EventHandlerCallback(Event e)
    {
        lock(__lockEventCallback){
            try
            {
                using (e)
                {
                    Console.WriteLine("------------------------------------------------------");
                    Console.WriteLine("Channel name: " + e.ChannelName);
                    Console.WriteLine("Unix timestamp: " + e.Timestamp + " ms (" + e.DateTime.ToLocalTime() + ")");

                    Console.WriteLine("Plate text: " + e.Vehicle.Plate.Text);
                    Console.WriteLine("Country: " + e.Vehicle.Plate.Country);

                    Console.WriteLine("Make: " + e.Vehicle.Attributes.Make);
                    Console.WriteLine("Model: " + e.Vehicle.Attributes.Model);
                    Console.WriteLine("Color: " + e.Vehicle.Attributes.Color);
                    Console.WriteLine("Category: " + e.Vehicle.Attributes.Category);

                    Console.WriteLine();
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Exception in event callback. " + ex);
            }
        }
    }

    static void Main(string[] args)
    {
        try
        {
            // INITIALIZE COMMON ANPR OBJECT
            using Anpr.AnprBuilder anprBuilder = Anpr.Builder();
            using Anpr anpr = anprBuilder
                .Type(AnprType.Local) // use LocalGo for CARMEN_GO engines
                .LocalConcurrencyLimit(2) //TODO: change it to a value that matches the number of core licences you have
                .Build();

            // INITIALIZE COMMON MMR (Make and Model Recognition) OBJECT
            using Mmr.MmrBuilder mmrBuilder = Mmr.Builder();
            using Mmr mmr = mmrBuilder
                .Type(MmrType.Local)
                .Build();

            // BUILD STREAM PROCESSOR OBJECTS THAT USE THE COMMON ANPR AND MMR RESOURCES
            List<StreamProcessor> streams = streamConfigs.Select(stream => {
                using StreamProcessor.StreamProcessorBuilder streamProcessorBuilder = StreamProcessor.Builder();
                return streamProcessorBuilder
                    .Source(stream.Url)
                    .Region(stream.Region)
                    .Name(stream.Name)
                    .EventCallback(EventHandlerCallback)
                    .StatusChangeCallback
                    (
                        (stream1, status) =>
                        {
                            Console.WriteLine("Stream \"" + stream1.Name + "\" (" + stream1.SessionId
                                + ") status changed to \"" + status + "\"");

                            if (status == StreamProcessorStatus.Finished)
                            {
                                Console.WriteLine("STREAM PROCESSING HAS FINISHED in stream: \"" + stream1.Name
                                    + "\"! If the program is still running and you want to stop it, please press 'q' then 'Enter'");
                            }
                        }
                    )
                    .Anpr(anpr)
                    .Mmr(mmr)
                    .Roi(new List<Carmen.Point>
                    {
                        new Carmen.Point(0.03, 0.01),
                        new Carmen.Point(0.93, 0.04),
                        new Carmen.Point(0.98, 0.96),
                        new Carmen.Point(0.05, 0.97)
                    })
                    .AutoReconnect(true)
                    .Build();
                }
            ).ToList();

            Console.WriteLine("Please press 'q' then 'Enter' to stop stream processing.");

            // START STREAM PROCESSORS
            foreach (var stream in streams)
            {
                stream.Start();
            }

            // STREAM PROCESSORS ARE NOW RUNNING ASYNCHRONOUSLY

            // WAIT FOR KEY 'q' FROM STANDARD INPUT
            while (Console.ReadLine() != "q");

            // STOP STREAM PROCESSORS
            foreach (var stream in streams)
            {
                stream.Stop();
                stream.Dispose();
            }
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
        }

        Console.WriteLine("Please press a key to exit the program.");
        Console.ReadKey();
    }
}
