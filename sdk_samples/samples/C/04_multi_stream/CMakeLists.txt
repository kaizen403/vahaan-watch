project(c_sample_04_multi_stream)

add_executable(${PROJECT_NAME} 04_multi_stream.c)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
