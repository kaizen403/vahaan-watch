/**
 * CARMEN Video SDK
 *
 * @category    C++ Sample
 * @package     CARMEN Video C++ Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) on a video stream.
 * Only the most essential configuration settings and output field usages are shown in this example.
 * The usage of vehicle make & model recognition feature is NOT shown in this example.
 */

#include <iostream>

#include "utils.hpp"

#include <carmen/AnprBuilder.hpp>
#include <carmen/StreamProcessorBuilder.hpp>

void onEventCallback(const cm::Event& event) {
    std::cout << "------------------------------------------------------" << std::endl;
    std::cout << "Plate text: " << event.vehicle().plate().text() << std::endl;
    std::cout << "Country: " << event.vehicle().plate().country() << std::endl;

    std::cout << std::endl;
}

int main(int argc, char** argv) {
    try {
        if(argc < 3) {
            std::cout << "Usage: " << argv[0] << " <region code> <stream url / video file>" << std::endl;

            //  Region code:
            //      See in Reference Manual: Region List
            //
            //  Stream url examples:
            //      "rtsp://username:password@192.168.1.2:8994"
            //      "http://192.168.1.2:9901/video.mjpeg"
            //  Video file example:
            //      "file:///C:\\video.mp4"

            return -1;
        }
        std::string region = argv[1];
        std::string streamUrl = argv[2];

        cm::anpr::Anpr anpr = cm::anpr::AnprBuilder()
                .build();

        cm::video::StreamProcessor stream = cm::video::StreamProcessorBuilder()
                .source(streamUrl)
                .region(region)
                .name("Stream 1")
                .eventCallback(onEventCallback)
                .anpr(anpr)
                .statusChangeCallback(commonStatusCallback) // may be omitted, the example only uses it for showing status changes
                .build();

        std::cout << "Please press 'q' then 'Enter' to stop stream processing." << std::endl;

        stream.start();

        while(std::cin.get() != 'q');

        stream.stop();
    } catch(const std::exception& e) {
        std::cout << e.what() << std::endl;
        return -1;
    }
    return 0;
}
