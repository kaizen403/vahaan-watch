using Carmen;
using Carmen.Video;

public class Utils
{
    public static void CommonStatusCallback(Carmen.Video.StreamProcessor stream1, StreamProcessorStatus status)
    {
        Console.WriteLine("Stream \"" + stream1.Name + "\" (" + stream1.SessionId
                          + ") status changed to \"" + status + "\"");

        
        if(status == StreamProcessorStatus.Finished){
            Console.WriteLine("STREAM PROCESSING HAS FINISHED in stream: \"" + stream1.Name
                + "\"! If the program is still running and you want to stop it, please press 'q' then 'Enter'");
        }
    }
}