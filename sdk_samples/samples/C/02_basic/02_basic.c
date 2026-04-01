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
 * recognizes license plates (ANPR) and vehicle attributes (MMR) on a video stream.
 * Only the most essential output field usages are shown in this example.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "utils.h"

#include <carmen/Event.h>
#include <carmen/AnprBuilder.h>
#include <carmen/MmrBuilder.h>
#include <carmen/StreamProcessorBuilder.h>
#include <carmen/Logger.h>
#include <carmen/CmError.h>


void onEventCallback(CM_EVENT* e, void* userdata) {
    printf("------------------------------------------------------\n");
    printf("Unix timestamp: %" PRId64 " ms\n", e->timestamp);

    CM_VEHICLE* vehicle = e->vehicle;
    CM_PLATE* plate = vehicle->plate;

    //Plate
    printf("Plate text: %s\n", plate->text);
    printf("Country: %s\n", plate->country);

    //MMR
    printf("Make: %s\n", vehicle->mmrData->make);
    printf("Model: %s\n", vehicle->mmrData->model);
    printf("Color: ");
    printOptionalColorRGB(&vehicle->mmrData->color);
    printf("\n");
    printf("Category: %s\n", vehicle->mmrData->category);

    printf("\n");
    fflush(stdout);

    cm_event_free(e);
}

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

    cm_logger_set_global_logger_min_level(CM_LOGGER_LEVEL_WARNING);

    CM_ANPR_BUILDER anprBuilder;
    memset(&anprBuilder, 0, sizeof(anprBuilder));

    cm_anprbuilder_create(&anprBuilder);
    cm_anprbuilder_set_type(anprBuilder, CM_ANPR_TYPE_LOCAL); // use CM_ANPR_TYPE_LOCAL_GO for CARMEN_GO engines
    cm_anprbuilder_set_local_concurrency_limit(anprBuilder, 1);

    CM_ANPR anpr;
    memset(&anpr, 0, sizeof(anpr));
    CHECK_CM_ERROR(cm_anprbuilder_build(anprBuilder, &anpr));
    cm_anprbuilder_free(anprBuilder);

    CM_MMR_BUILDER mmrBuilder;
    memset(&mmrBuilder, 0, sizeof(mmrBuilder));
    cm_mmrbuilder_create(&mmrBuilder);
    cm_mmrbuilder_set_type(mmrBuilder, CM_MMR_TYPE_LOCAL);

    CM_MMR mmr;
    memset(&mmr, 0, sizeof(mmr));
    CHECK_CM_ERROR(cm_mmrbuilder_build(mmrBuilder, &mmr));
    cm_mmrbuilder_free(mmrBuilder);

    CM_STREAM_PROCESSOR_BUILDER builder;
    memset(&builder, 0, sizeof(builder));
    cm_streamprocessorbuilder_create(&builder);

    cm_streamprocessorbuilder_set_source(builder, streamUrl);
    cm_streamprocessorbuilder_set_region(builder, region);
    cm_streamprocessorbuilder_set_name(builder, "Stream 1");
    cm_streamprocessorbuilder_set_event_callback(builder, onEventCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_status_change_callback(builder, onStatusChangeCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_anpr(builder, anpr);
    cm_streamprocessorbuilder_set_mmr(builder, mmr);
    cm_streamprocessorbuilder_set_anpr_color_recognition(builder, CM_TRUE);
    cm_streamprocessorbuilder_set_mmr_color_recognition(builder, CM_TRUE);
    cm_streamprocessorbuilder_set_auto_reconnect(builder, CM_TRUE);

    CM_POINT points[] = {
            {0.0,  0.0},
            {0.95, 0.0},
            {0.95, 0.95},
            {0.0,  0.95}
    };
    cm_streamprocessorbuilder_set_roi(builder, points, 4);

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
    cm_mmr_free(mmr);

    return 0;
}
