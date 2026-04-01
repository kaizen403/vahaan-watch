/**
 * CARMEN Video SDK
 *
 * @category    C Sample
 * @package     CARMEN Video C Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * recognizes license plates (ANPR) on a video stream.
 * Only the most essential configuration settings and output field usages are shown in this example.
 * The usage of vehicle make & model recognition feature is NOT shown in this example.
 */

#include <stdio.h>
#include <string.h>

#include "utils.h"

#include <carmen/Event.h>
#include <carmen/AnprBuilder.h>
#include <carmen/StreamProcessorBuilder.h>
#include <carmen/CmError.h>


void onEventCallback(CM_EVENT* e, void* userdata) {
    printf("------------------------------------------------------\n");
    printf("Plate text: %s\n", e->vehicle->plate->text);
    printf("Country: %s\n", e->vehicle->plate->country);

    printf("\n");
    fflush(stdout);
    cm_event_free(e);
}

// may be omitted, the example only uses it for showing status changes
void onStatusChangeCallback(CM_STREAM_PROCESSOR handle, enum CM_StreamProcessorStatus status, void* userdata){
    commonStatusCallback(handle, status);
};

int main(int argc, char** argv) {

    if(argc < 3) {
        printf("Usage: %s <region code> <stream url / video file>\n", argv[0]);

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

    const char* region = argv[1];
    const char* streamUrl = argv[2];

    CM_ANPR_BUILDER anprBuilder;
    memset(&anprBuilder, 0, sizeof(anprBuilder));
    cm_anprbuilder_create(&anprBuilder);

    CM_ANPR anpr;
    memset(&anpr, 0, sizeof(anpr));
    CHECK_CM_ERROR(cm_anprbuilder_build(anprBuilder, &anpr));
    cm_anprbuilder_free(anprBuilder);

    CM_STREAM_PROCESSOR_BUILDER builder;
    memset(&builder, 0, sizeof(builder));
    cm_streamprocessorbuilder_create(&builder);

    cm_streamprocessorbuilder_set_source(builder, streamUrl);
    cm_streamprocessorbuilder_set_region(builder, region);
    cm_streamprocessorbuilder_set_name(builder, "Stream 1");
    cm_streamprocessorbuilder_set_event_callback(builder, onEventCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_anpr(builder, anpr);

    // may be omitted, the example only uses it for showing status changes
    cm_streamprocessorbuilder_set_status_change_callback(builder, onStatusChangeCallback, NULL, NULL);

    CM_STREAM_PROCESSOR stream;
    memset(&stream, 0, sizeof(stream));
    CHECK_CM_ERROR(cm_streamprocessorbuilder_build(builder, &stream));
    cm_streamprocessorbuilder_free(builder);

    printf("Please press 'q' then 'Enter' to stop stream processing.\n");

    CHECK_CM_ERROR(cm_streamprocessor_start(stream));

    while(getc(stdin) != 'q');

    CHECK_CM_ERROR(cm_streamprocessor_stop(stream));

    cm_streamprocessor_free(stream);
    cm_anpr_free(anpr);

    return 0;
}
